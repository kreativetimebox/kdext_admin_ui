import { dexaiQuery as query } from "./dexaidb.js";
import { buildOrderByClause } from "./sort.js";
import { ensureBugNotificationTables } from "./bugNotificationService.js";

const BUG_TRACKER_SORT_COLUMNS = new Set([
  "business_name", "client_email", "request_id", "result_id",
  "ocr_document_type", "bug_status", "action_status", "issue_type", "issue_description",
  "created_at", "hitl_assigned_to", "bug_flagged_at", "bug_tracker_id",
]);

/**
 * Company-agnostic bug-tracking view over document_processing_requests,
 * backing the "Bug Tracker" tab and the homepage stats section. Unlike
 * lib/queries.js's getDocumentsWithMissingFields, this isn't about missing
 * fields at all, so it skips MISSING_FIELDS_EXPR/hitl_status entirely.
 */

const DOC_FROM = `
  FROM document_processing_requests d
  LEFT JOIN document_types dt ON dt.document_type_id = d.document_type_id
  LEFT JOIN users u ON u.user_id = d.user_id
  LEFT JOIN internal_users hiu ON hiu.internal_user_id::text = d.hitl_assigned_to
  LEFT JOIN bug_notification_overrides bno ON bno.bug_tracker_id = d.bug_tracker_id
`;

// Display name for whoever a row is assigned to for HITL review — falls
// back to their email when no name is on file. Read-only in this tab
// (assignment itself happens via lib/hitlAssignment.js's auto-assign or the
// manual assign-hitl endpoint on the HITL EDIT page, not from here).
const HITL_ASSIGNED_TO_EXPR = `COALESCE(NULLIF(BTRIM(CONCAT(hiu.first_name, ' ', hiu.last_name)), ''), hiu.email)`;

/** Same exclusion used by every other admin-facing query in this app. */
const HIDDEN_CLIENT_EMAIL = "john@example.com";

// bug_status is only ever written by a manual (super-admin) edit, so a
// non-null stored value always means a human decided it — COALESCE lets
// that value win over the derived one, with no extra lock column needed.
// (Duplicated from lib/queries.js / lib/dexai.js per this codebase's
// existing convention of not centralizing per-file SQL fragments.)
const BUG_STATUS_EXPR = `
  COALESCE(
    d.bug_status,
    CASE
      WHEN d.validation = true THEN 'Closed'
      WHEN d.validation = false AND d.issue_type IS NULL THEN NULL
      WHEN d.validation = false AND d.issue_type IS NOT NULL THEN 'Open'
      ELSE NULL
    END
  )
`;

// Display-only derivation: a cleanly-validated document that was never
// flagged shows as "no issue" instead of a blank cell. The issueType filter
// below and bug_status's own derivation still read the raw d.issue_type
// column, not this — "no issue" is a label, not a real category a document
// can be filtered/counted against.
const ISSUE_TYPE_EXPR = `
  COALESCE(
    d.issue_type,
    CASE WHEN d.validation = true AND d.issue_type IS NULL THEN 'no issue' END
  )
`;

/**
 * Server-paginated list for the Bug Tracker table.
 * @param {object} filters - { search, clientEmails[], docType, issueType, bugStatus, actionStatus, clientId, page, pageSize }
 */
export async function getBugTrackerRows(filters = {}) {
  const { search = "", clientEmails = [], docType = "", issueType = "", bugStatus = "", actionStatus = "", clientId = "", sortBy = "", sortOrder = "desc", page = 1, pageSize = 50 } = filters;

  const whereConditions = [
    "d.is_deleted = false",
    "d.result_id IS NOT NULL",
    // bug_tracker_id, not issue_type: a row only becomes a tracked bug (and
    // shows up here) once it's been Published with an issue_type set -- see
    // lib/queries.js's updateHitlResult. issue_type alone is just a draft
    // pick made while the document is still under review.
    "d.bug_tracker_id IS NOT NULL",
  ];
  const params = [];
  let paramIndex = 1;

  params.push(HIDDEN_CLIENT_EMAIL);
  whereConditions.push(`(u.email IS NULL OR lower(u.email) <> lower($${paramIndex}))`);
  paramIndex++;

  if (search) {
    params.push(`%${search}%`);
    whereConditions.push(`(
      d.result_id ILIKE $${paramIndex}
      OR d.request_id ILIKE $${paramIndex}
      OR COALESCE(d.transaction_id, '') ILIKE $${paramIndex}
      OR COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) ILIKE $${paramIndex}
      OR COALESCE(NULLIF(BTRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), '') ILIKE $${paramIndex}
      OR COALESCE(u.email, '') ILIKE $${paramIndex}
      OR CAST(d.bug_tracker_id AS text) ILIKE $${paramIndex}
      OR ('BUG-' || LPAD(d.bug_tracker_id::text, 5, '0')) ILIKE $${paramIndex}
    )`);
    paramIndex++;
  }

  if (clientEmails.length) {
    params.push(clientEmails.map((e) => e.toLowerCase()));
    whereConditions.push(`lower(u.email) = ANY($${paramIndex}::text[])`);
    paramIndex++;
  }

  if (docType) {
    params.push(docType);
    whereConditions.push(
      `COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) = $${paramIndex}`
    );
    paramIndex++;
  }

  if (issueType) {
    params.push(issueType);
    whereConditions.push(`d.issue_type = $${paramIndex}`);
    paramIndex++;
  }

  if (actionStatus === "NULL") {
    whereConditions.push(`d.action_status IS NULL`);
  } else if (actionStatus) {
    params.push(actionStatus);
    whereConditions.push(`d.action_status = $${paramIndex}`);
    paramIndex++;
  }

  // Forced (not user-chosen) for CLIENT_ADMIN/CLIENT_USER callers — see
  // app/api/bug-tracker/route.js, which overrides whatever's in the request
  // with the requester's own client_id rather than trusting query params.
  if (clientId) {
    params.push(clientId);
    whereConditions.push(`d.user_id = $${paramIndex}`);
    paramIndex++;
  }

  const whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  // bug_status is a computed column (derived in the inner query below), so
  // it can only be filtered in an outer WHERE, same as hitl_status/status
  // in lib/queries.js's getDocumentsWithMissingFields.
  const outerConditions = [];
  if (bugStatus === "NULL") {
    // Sentinel for "no status assigned" -- can't be a bound param since
    // `= NULL` never matches in SQL, unlike `IS NULL`.
    outerConditions.push(`compute_bug_status IS NULL`);
  } else if (bugStatus) {
    params.push(bugStatus);
    outerConditions.push(`compute_bug_status = $${paramIndex}`);
    paramIndex++;
  }
  const outerWhereClause = outerConditions.length ? `WHERE ${outerConditions.join(" AND ")}` : "";

  const safePageSize = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
  const safePage = Math.max(Number(page) || 1, 1);
  const limitParamIndex = paramIndex;
  const offsetParamIndex = paramIndex + 1;
  params.push(safePageSize, (safePage - 1) * safePageSize);

  await ensureBugNotificationTables();

  const sql = `
    SELECT
      COUNT(*) OVER() AS total_count,
      bug_tracker_id,
      result_id,
      request_id,
      transaction_id,
      ocr_document_type,
      client_name,
      client_email,
      business_name,
      issue_type,
      issue_description,
      compute_bug_status AS bug_status,
      action_status,
      hitl_assigned_to,
      bug_flagged_at,
      comments,
      is_muted,
      created_at
    FROM (
      SELECT
        d.bug_tracker_id                                               AS bug_tracker_id,
        d.result_id                                                    AS result_id,
        d.request_id                                                   AS request_id,
        d.transaction_id                                               AS transaction_id,
        COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) AS ocr_document_type,
        COALESCE(d.submitted_at, d.created_at, d.completed_at)         AS created_at,
        NULLIF(BTRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), '') AS client_name,
        u.email                                                        AS client_email,
        NULLIF(BTRIM(COALESCE(u.company_name, '')), '')                AS business_name,
        ${ISSUE_TYPE_EXPR}                                             AS issue_type,
        d.issue_description                                            AS issue_description,
        ${BUG_STATUS_EXPR}                                             AS compute_bug_status,
        d.action_status                                                AS action_status,
        ${HITL_ASSIGNED_TO_EXPR}                                       AS hitl_assigned_to,
        d.bug_flagged_at                                               AS bug_flagged_at,
        COALESCE(d.comments::jsonb, '[]'::jsonb)                       AS comments,
        COALESCE(bno.is_muted, false)                                  AS is_muted
      ${DOC_FROM}
      ${whereClause}
    ) t
    ${outerWhereClause}
    ${buildOrderByClause(sortBy, sortOrder, BUG_TRACKER_SORT_COLUMNS, "created_at")}
    LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
  `;

  const result = await query(sql, params);
  const total = result.rows[0]?.total_count ? Number(result.rows[0].total_count) : 0;
  const rows = result.rows.map(({ total_count, ...r }) => ({ ...r, id: r.result_id }));
  return { rows, total };
}

/**
 * Same as getBugTrackerRows but without pagination, for CSV export of every
 * row matching the current filters. Hard-capped so a runaway filter (or
 * none at all) can't try to return the whole table.
 */
const EXPORT_ROW_CAP = 20000;

export async function getBugTrackerRowsForExport(filters = {}) {
  const { search = "", clientEmails = [], docType = "", issueType = "", bugStatus = "", actionStatus = "", clientId = "", sortBy = "", sortOrder = "desc", limit = EXPORT_ROW_CAP } = filters;

  const whereConditions = [
    "d.is_deleted = false",
    "d.result_id IS NOT NULL",
    // Same rule as getBugTrackerRows: bug_tracker_id, not issue_type, gates
    // membership -- see the comment there.
    "d.bug_tracker_id IS NOT NULL",
  ];
  const params = [];
  let paramIndex = 1;

  params.push(HIDDEN_CLIENT_EMAIL);
  whereConditions.push(`(u.email IS NULL OR lower(u.email) <> lower($${paramIndex}))`);
  paramIndex++;

  if (search) {
    params.push(`%${search}%`);
    whereConditions.push(`(
      d.result_id ILIKE $${paramIndex}
      OR d.request_id ILIKE $${paramIndex}
      OR COALESCE(d.transaction_id, '') ILIKE $${paramIndex}
      OR COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) ILIKE $${paramIndex}
      OR COALESCE(NULLIF(BTRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), '') ILIKE $${paramIndex}
      OR COALESCE(u.email, '') ILIKE $${paramIndex}
      OR CAST(d.bug_tracker_id AS text) ILIKE $${paramIndex}
      OR ('BUG-' || LPAD(d.bug_tracker_id::text, 5, '0')) ILIKE $${paramIndex}
    )`);
    paramIndex++;
  }

  if (clientEmails.length) {
    params.push(clientEmails.map((e) => e.toLowerCase()));
    whereConditions.push(`lower(u.email) = ANY($${paramIndex}::text[])`);
    paramIndex++;
  }

  if (docType) {
    params.push(docType);
    whereConditions.push(
      `COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) = $${paramIndex}`
    );
    paramIndex++;
  }

  if (issueType) {
    params.push(issueType);
    whereConditions.push(`d.issue_type = $${paramIndex}`);
    paramIndex++;
  }

  if (actionStatus === "NULL") {
    whereConditions.push(`d.action_status IS NULL`);
  } else if (actionStatus) {
    params.push(actionStatus);
    whereConditions.push(`d.action_status = $${paramIndex}`);
    paramIndex++;
  }

  if (clientId) {
    params.push(clientId);
    whereConditions.push(`d.user_id = $${paramIndex}`);
    paramIndex++;
  }

  const whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  const outerConditions = [];
  if (bugStatus === "NULL") {
    // Sentinel for "no status assigned" -- can't be a bound param since
    // `= NULL` never matches in SQL, unlike `IS NULL`.
    outerConditions.push(`compute_bug_status IS NULL`);
  } else if (bugStatus) {
    params.push(bugStatus);
    outerConditions.push(`compute_bug_status = $${paramIndex}`);
    paramIndex++;
  }
  const outerWhereClause = outerConditions.length ? `WHERE ${outerConditions.join(" AND ")}` : "";

  const sql = `
    SELECT
      bug_tracker_id,
      result_id,
      request_id,
      transaction_id,
      ocr_document_type,
      client_name,
      client_email,
      business_name,
      issue_type,
      issue_description,
      compute_bug_status AS bug_status,
      action_status,
      hitl_assigned_to,
      bug_flagged_at,
      document_path,
      created_at
    FROM (
      SELECT
        d.bug_tracker_id                                               AS bug_tracker_id,
        d.result_id                                                    AS result_id,
        d.request_id                                                   AS request_id,
        d.transaction_id                                               AS transaction_id,
        COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) AS ocr_document_type,
        COALESCE(d.submitted_at, d.created_at, d.completed_at)         AS created_at,
        NULLIF(BTRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), '') AS client_name,
        u.email                                                        AS client_email,
        NULLIF(BTRIM(COALESCE(u.company_name, '')), '')                AS business_name,
        ${ISSUE_TYPE_EXPR}                                             AS issue_type,
        d.issue_description                                            AS issue_description,
        ${BUG_STATUS_EXPR}                                             AS compute_bug_status,
        d.action_status                                                AS action_status,
        ${HITL_ASSIGNED_TO_EXPR}                                       AS hitl_assigned_to,
        d.bug_flagged_at                                               AS bug_flagged_at,
        d.document_path                                                AS document_path
      ${DOC_FROM}
      ${whereClause}
    ) t
    ${outerWhereClause}
    ${buildOrderByClause(sortBy, sortOrder, BUG_TRACKER_SORT_COLUMNS, "created_at")}
    LIMIT ${Number(limit) || EXPORT_ROW_CAP}
  `;

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Aggregate Open/To Be Tested/Closed counts, broken down by document type,
 * for the homepage stats section. Totals are summed client-side from the
 * per-doc-type rows rather than a second query.
 * @param {object} filters - { clientIds[] } - individual client (user_id), not company
 */
export async function getBugTrackerStats(filters = {}) {
  const { clientIds = [] } = filters;

  const whereConditions = [
    "d.is_deleted = false",
    "d.result_id IS NOT NULL",
  ];
  const params = [];
  let paramIndex = 1;

  params.push(HIDDEN_CLIENT_EMAIL);
  whereConditions.push(`(u.email IS NULL OR lower(u.email) <> lower($${paramIndex}))`);
  paramIndex++;

  if (clientIds.length) {
    params.push(clientIds);
    whereConditions.push(`d.user_id = ANY($${paramIndex}::int[])`);
    paramIndex++;
  }

  const whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  const sql = `
    SELECT
      document_type,
      COUNT(*) FILTER (WHERE compute_bug_status = 'Open')                                                     AS open,
      COUNT(*) FILTER (WHERE compute_bug_status IN ('TO_BE_TESTED', 'To Be Tested'))                         AS to_be_tested,
      COUNT(*) FILTER (WHERE compute_bug_status = 'Closed')                                                   AS closed,
      COUNT(*) FILTER (WHERE d_action_status IN ('Enhancement', 'enhancement'))                               AS enhancement,
      COUNT(*) FILTER (WHERE d_action_status IN ('Model Tuning', 'model tuning'))                            AS model_tuning,
      COUNT(*) FILTER (WHERE d_action_status IN ('Invalid doc', 'invalid doc', 'Invalid Doc'))                AS invalid_doc,
      COUNT(*) FILTER (WHERE d_action_status IN ('Tech Issue', 'tech issue'))                                 AS tech_issue
    FROM (
      SELECT
        COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name, 'Unknown') AS document_type,
        ${BUG_STATUS_EXPR}                                                        AS compute_bug_status,
        d.action_status                                                           AS d_action_status
      ${DOC_FROM}
      ${whereClause}
    ) t
    GROUP BY document_type
    HAVING COUNT(*) FILTER (WHERE compute_bug_status IS NOT NULL OR d_action_status IS NOT NULL) > 0
    ORDER BY document_type
  `;

  const result = await query(sql, params);
  const byDocType = result.rows.map((r) => ({
    document_type: r.document_type,
    open: Number(r.open || 0),
    toBeTested: Number(r.to_be_tested || 0),
    closed: Number(r.closed || 0),
    enhancement: Number(r.enhancement || 0),
    modelTuning: Number(r.model_tuning || 0),
    invalidDoc: Number(r.invalid_doc || 0),
    techIssue: Number(r.tech_issue || 0),
  }));

  const totals = byDocType.reduce(
    (acc, r) => {
      acc.open += r.open;
      acc.toBeTested += r.toBeTested;
      acc.closed += r.closed;
      acc.enhancement += r.enhancement;
      acc.modelTuning += r.modelTuning;
      acc.invalidDoc += r.invalidDoc;
      acc.techIssue += r.techIssue;
      return acc;
    },
    { open: 0, toBeTested: 0, closed: 0, enhancement: 0, modelTuning: 0, invalidDoc: 0, techIssue: 0 }
  );

  return { totals, byDocType };
}
