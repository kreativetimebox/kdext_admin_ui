// Auto-assigns document_processing_requests rows that still need human
// review to active HITL-role team members, keeping everyone's open workload
// as close to equal as possible. Driven by lib/hitlAssignmentMonitor.js's
// background poll loop, but exported standalone so it can also be called
// on demand (e.g. a manual "run now" trigger) without duplicating this logic.
import { dexaiQuery as query } from "./dexaidb.js";
import { MISSING_FIELDS_EXPR } from "./queries.js";

const DOC_FROM = `
  FROM document_processing_requests d
  LEFT JOIN document_types dt ON dt.document_type_id = d.document_type_id
  LEFT JOIN users u ON u.user_id = d.user_id
`;

const HIDDEN_CLIENT_EMAIL = "john@example.com";

// Same derivation lib/queries.js's commitReprocessedResult uses to decide
// whether a row still needs human review — "needs to be checked by an HITL
// member" means this computed value, not the raw pipeline `status` column
// (which only reflects whether OCR/extraction finished running).
const HITL_STATUS_EXPR = `
  COALESCE(
    d.hitl_status,
    CASE
      WHEN d.validation = true
        THEN 'COMPLETED'
      WHEN d.error_code IS NOT NULL OR d.error_message IS NOT NULL
        THEN 'FAILED'
      WHEN d.processing_duration_ms IS NULL OR d.result_id IS NULL
        THEN 'PROCESSING'
      WHEN COALESCE((d.formatted_result::jsonb->>'hitl_check')::int, 0) = 0 AND COALESCE(array_length(${MISSING_FIELDS_EXPR}, 1), 0) = 0
        THEN 'COMPLETED'
      ELSE 'TO_BE_TESTED'
    END
  )
`;

// Cap on how many rows one poll tick will assign — keeps a large backlog
// (e.g. the first run after deploying this feature) from locking up a
// single tick; the next tick picks up where this one left off.
const BATCH_LIMIT = 200;

// Currently-logged-in HITL members and how many not-yet-completed rows are
// already assigned to each. Raw d.hitl_status (not the derived expression
// above) is reliable here because every assigned row explicitly carries
// 'PENDING' until commitReprocessedResult sets it to 'COMPLETED'.
//
// Eligibility is based purely on "logged in" — is_active is deliberately NOT
// checked here (a deactivated account can't log in in the first place, so
// this doesn't open assignment up to deactivated members in practice).
// "Logged in" is: they've logged in within the last 24h — matching the
// JWT's own expiry, since there's no server-side session table to check
// against directly — and haven't logged out since. logged_out_at is cleared
// on every successful login and stamped on logout (app/api/auth/login and
// /logout), so `logged_out_at IS NULL` means "no logout recorded since their
// last login."
async function getActiveHitlLoads() {
  const result = await query(
    `SELECT
       iu.internal_user_id,
       COUNT(d.request_id) FILTER (
         WHERE d.hitl_status IS DISTINCT FROM 'COMPLETED' AND d.is_deleted = false
       ) AS load
     FROM internal_users iu
     LEFT JOIN document_processing_requests d ON d.hitl_assigned_to = iu.internal_user_id::text
     WHERE iu.logged_out_at IS NULL
       AND iu.last_login_at IS NOT NULL
       AND iu.last_login_at + INTERVAL '24 hours' > CURRENT_TIMESTAMP
       AND EXISTS (
         SELECT 1 FROM user_roles ur
         JOIN roles r ON r.role_id = ur.role_id
         WHERE ur.internal_user_id = iu.internal_user_id AND r.role_name = 'HITL'
       )
     GROUP BY iu.internal_user_id
     ORDER BY load ASC, iu.internal_user_id ASC`
  );
  return result.rows.map((r) => ({ internalUserId: r.internal_user_id, load: Number(r.load) }));
}

// Unassigned rows that still need review, oldest first (so a growing
// backlog is worked in upload order rather than arbitrarily). PROCESSING is
// excluded alongside COMPLETED — a row still mid-pipeline has nothing for a
// human to look at yet; it becomes a candidate once it lands on TO_BE_TESTED
// (or FAILED, which a HITL member does still triage).
async function getCandidateRequests(limit) {
  const result = await query(
    `SELECT result_id
     FROM (
       SELECT d.result_id, d.created_at, ${HITL_STATUS_EXPR} AS compute_hitl_status
       ${DOC_FROM}
       WHERE d.is_deleted = false
         AND d.result_id IS NOT NULL
         AND d.hitl_assigned_to IS NULL
         AND (u.email IS NULL OR lower(u.email) <> lower($1))
     ) t
     WHERE compute_hitl_status NOT IN ('COMPLETED', 'PROCESSING')
     ORDER BY created_at ASC
     LIMIT $2`,
    [HIDDEN_CLIENT_EMAIL, limit]
  );
  return result.rows;
}

/**
 * Per-HITL-member breakdown of files assigned to them: how many are still
 * pending (computed hitl_status != COMPLETED) vs completed, for the User
 * Logs → HITL Workload section. Every HITL-role member is included
 * (including inactive ones, so a deactivated member's stats — 0 pending,
 * per lib/teamMembers.js's unassign-on-deactivate — stay visible), left-joined
 * against the filtered document set so someone with zero matching rows still
 * shows a 0/0 row instead of disappearing.
 * @param {object} filters - { dateFrom, dateTo, companies[], email, docType }
 */
export async function getHitlMemberStats(filters = {}) {
  const { dateFrom = "", dateTo = "", companies = [], email = "", docType = "" } = filters;

  const whereConditions = [
    "d.is_deleted = false",
    "d.result_id IS NOT NULL",
    "d.hitl_assigned_to IS NOT NULL",
  ];
  const params = [];
  let paramIndex = 1;

  params.push(HIDDEN_CLIENT_EMAIL);
  whereConditions.push(`(u.email IS NULL OR lower(u.email) <> lower($${paramIndex}))`);
  paramIndex++;

  if (dateFrom) {
    params.push(dateFrom);
    whereConditions.push(`COALESCE(d.submitted_at, d.created_at, d.completed_at) >= $${paramIndex}::date`);
    paramIndex++;
  }

  if (dateTo) {
    params.push(dateTo);
    whereConditions.push(`COALESCE(d.submitted_at, d.created_at, d.completed_at) < ($${paramIndex}::date + INTERVAL '1 day')`);
    paramIndex++;
  }

  if (companies.length) {
    // "NULL" is a sentinel for "no company on file" (can't be a bound param
    // since `= NULL` never matches in SQL, unlike `IS NULL`/`= ''` here) —
    // split it out from real company names, which still go through = ANY.
    const realCompanies = companies.filter((c) => c !== "NULL");
    const companyConditions = [];
    if (realCompanies.length) {
      params.push(realCompanies);
      companyConditions.push(`COALESCE(BTRIM(u.company_name), '') = ANY($${paramIndex}::text[])`);
      paramIndex++;
    }
    if (companies.includes("NULL")) {
      companyConditions.push(`COALESCE(BTRIM(u.company_name), '') = ''`);
    }
    if (companyConditions.length) {
      whereConditions.push(`(${companyConditions.join(" OR ")})`);
    }
  }

  if (email) {
    params.push(`%${email}%`);
    whereConditions.push(`COALESCE(u.email, '') ILIKE $${paramIndex}`);
    paramIndex++;
  }

  if (docType) {
    params.push(docType);
    whereConditions.push(`COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) = $${paramIndex}`);
    paramIndex++;
  }

  const whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  const sql = `
    SELECT
      iu.internal_user_id,
      iu.email,
      iu.first_name,
      iu.last_name,
      iu.is_active,
      COUNT(t.result_id) FILTER (WHERE t.compute_hitl_status = 'COMPLETED')       AS completed,
      COUNT(t.result_id) FILTER (WHERE t.compute_hitl_status IS DISTINCT FROM 'COMPLETED') AS pending
    FROM internal_users iu
    LEFT JOIN (
      SELECT d.result_id, d.hitl_assigned_to, ${HITL_STATUS_EXPR} AS compute_hitl_status
      ${DOC_FROM}
      ${whereClause}
    ) t ON t.hitl_assigned_to = iu.internal_user_id::text
    WHERE EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.role_id = ur.role_id
      WHERE ur.internal_user_id = iu.internal_user_id AND r.role_name = 'HITL'
    )
    GROUP BY iu.internal_user_id, iu.email, iu.first_name, iu.last_name, iu.is_active
    ORDER BY iu.first_name NULLS LAST, iu.email
  `;

  const result = await query(sql, params);
  return result.rows.map((r) => {
    const pending = Number(r.pending);
    const completed = Number(r.completed);
    const total = pending + completed;
    return {
      internalUserId: r.internal_user_id,
      email: r.email,
      firstName: r.first_name,
      lastName: r.last_name,
      isActive: r.is_active,
      pending,
      completed,
      total,
      pendingPct: total ? Math.round((pending / total) * 1000) / 10 : 0,
      completedPct: total ? Math.round((completed / total) * 1000) / 10 : 0,
    };
  });
}

/**
 * Assigns every unassigned, still-needs-review row to whichever active HITL
 * member currently has the fewest open assignments, one row at a time (each
 * assignment updates that member's in-memory load before picking the next
 * row's target) so a big batch fans out evenly instead of piling onto
 * whoever was least-loaded at the start.
 */
export async function autoAssignHitlReviews() {
  const loads = await getActiveHitlLoads();
  if (loads.length === 0) {
    return { assigned: 0, candidates: 0, skippedReason: "no active HITL members" };
  }

  const candidates = await getCandidateRequests(BATCH_LIMIT);
  let assigned = 0;

  for (const row of candidates) {
    loads.sort((a, b) => a.load - b.load || a.internalUserId - b.internalUserId);
    const target = loads[0];

    // hitl_assigned_to IS NULL guard: defense against a second poll tick
    // (or a manual assign) racing this same row between SELECT and UPDATE.
    const result = await query(
      `UPDATE document_processing_requests
          SET hitl_assigned_to = $1,
              hitl_status = 'PENDING',
              updated_at = CURRENT_TIMESTAMP
        WHERE result_id = $2
          AND hitl_assigned_to IS NULL`,
      [target.internalUserId, row.result_id]
    );

    if (result.rowCount > 0) {
      target.load += 1;
      assigned += 1;
    }
  }

  return { assigned, candidates: candidates.length };
}
