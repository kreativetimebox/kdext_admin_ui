import { dexaiQuery } from "./dexaidb";
import { buildOrderByClause } from "./sort";

const DEXAI_RESULTS_SORT_COLUMNS = new Set([
  "request_id", "result_id", "document_type", "key_environment", "status",
  "validation", "bug_status", "issue_type", "created_at", "updated_at",
  "processing_duration_ms",
]);
// The export query (below) has no outer wrapping level that computes
// `validation` (it isn't one of the exported columns), so it can't be
// sorted by that name the way the paginated list can.
const DEXAI_RESULTS_EXPORT_SORT_COLUMNS = new Set(
  [...DEXAI_RESULTS_SORT_COLUMNS].filter((c) => c !== "validation")
);
const DEXAI_RESULTS_DEFAULT_SORT = "COALESCE(submitted_at, created_at)";

/**
 * Fetch all users from the MAIN_FINANCE_DB users table together with summary
 * counts of their document_processing_requests. Optional search filter over
 * email/first_name/last_name.
 */

const NULLISH_TEXT = `(
  $$VAL$$ IS NULL
  OR BTRIM($$VAL$$) = ''
  OR lower(BTRIM($$VAL$$)) IN ('null','n/a','na')
)`;

const fieldNull = (jsonExpr) => NULLISH_TEXT.replace("$$VAL$$", jsonExpr);

const itemsMissing = (...paths) => {
  const checks = paths
    .map(
      (p) =>
        `(jsonb_typeof(d.formatted_result::jsonb->'${p}') = 'array' AND jsonb_array_length(d.formatted_result::jsonb->'${p}') > 0)`
    )
    .join(" OR ");
  return `NOT (${checks})`;
};

/* helper: a missing-field name appears in the output array if its check is true */
const missingIf = (cond, name) => `CASE WHEN ${cond} THEN '${name}' END`;

const FIRST_PATH = (...paths) =>
  `COALESCE(${paths
    .map((p) => `NULLIF(BTRIM(d.formatted_result::jsonb->>'${p}'), '')`)
    .join(", ")}, NULL)`;


const RECEIPT_MISSING = `
  ARRAY_REMOVE(ARRAY[
    ${missingIf(fieldNull(FIRST_PATH("document_id", "documentId")), "document_id")},
    ${missingIf(fieldNull(FIRST_PATH("supplier_name", "supplierName")), "supplier_name")},
    ${missingIf(fieldNull(FIRST_PATH("receipt_date", "date")), "receipt_date")},
    ${missingIf(fieldNull(FIRST_PATH("currency", "currencyCode")), "currency")},
    ${missingIf(fieldNull(FIRST_PATH("total_amount", "totalAmount")), "total_amount")},
    ${missingIf(fieldNull(FIRST_PATH("net_amount", "netAmount")), "net_amount")},
    ${missingIf(fieldNull(FIRST_PATH("vat_amount", "taxAmount")), "vat_amount")},
    ${missingIf(fieldNull(FIRST_PATH("discount", "discountAmount")), "discount")},
    ${missingIf(itemsMissing("items", "tableItems"), "items")}
  ], NULL)
`;

const BANK_MISSING = `
  ARRAY_REMOVE(ARRAY[
    ${missingIf(fieldNull(FIRST_PATH("bankName", "bank_name")), "bankName")},
    ${missingIf(fieldNull(FIRST_PATH("accountHolderName", "account_holder_name")), "accountHolderName")},
    ${missingIf(fieldNull(FIRST_PATH("openingDate", "opening_date")), "openingDate")},
    ${missingIf(fieldNull(FIRST_PATH("closingDate", "closing_date")), "closingDate")},
    ${missingIf(fieldNull(FIRST_PATH("openingBalance", "opening_balance")), "openingBalance")},
    ${missingIf(fieldNull(FIRST_PATH("closingBalance", "closing_balance")), "closingBalance")},
    ${missingIf(fieldNull(FIRST_PATH("currencyCode", "currency")), "currencyCode")},
    ${missingIf(itemsMissing("tableItems", "table_items", "items"), "tableItems")}
  ], NULL)
`;

const INVOICE_MISSING = `
  ARRAY_REMOVE(ARRAY[
    ${missingIf(fieldNull(FIRST_PATH("documentId", "document_id", "invoice_number")), "documentId")},
    ${missingIf(fieldNull(FIRST_PATH("supplierName", "supplier_name")), "supplierName")},
    ${missingIf(fieldNull(FIRST_PATH("customerName", "customer_name")), "customerName")},
    ${missingIf(fieldNull(FIRST_PATH("date", "invoice_date")), "date")},
    ${missingIf(fieldNull(FIRST_PATH("dueDate", "due_date")), "dueDate")},
    ${missingIf(fieldNull(FIRST_PATH("currencyCode", "currency")), "currencyCode")},
    ${missingIf(fieldNull(FIRST_PATH("totalAmount", "total_amount")), "totalAmount")},
    ${missingIf(fieldNull(FIRST_PATH("netAmount", "net_amount", "subtotal")), "netAmount")},
    ${missingIf(fieldNull(FIRST_PATH("taxAmount", "vat_amount")), "taxAmount")},
    ${missingIf(fieldNull(FIRST_PATH("discountAmount", "discount")), "discountAmount")},
    ${missingIf(itemsMissing("tableItems", "items"), "tableItems")}
  ], NULL)
`;

const DEFAULT_MISSING = `
  ARRAY_REMOVE(ARRAY[
    ${missingIf(fieldNull(FIRST_PATH("documentId")), "documentId")},
    ${missingIf(fieldNull(FIRST_PATH("date")), "date")},
    ${missingIf(fieldNull(FIRST_PATH("dueDate")), "dueDate")},
    ${missingIf(fieldNull(FIRST_PATH("currencyCode")), "currencyCode")},
    ${missingIf(fieldNull(FIRST_PATH("totalAmount")), "totalAmount")},
    ${missingIf(fieldNull(FIRST_PATH("netAmount")), "netAmount")},
    ${missingIf(fieldNull(FIRST_PATH("taxAmount")), "taxAmount")},
    ${missingIf(fieldNull(FIRST_PATH("discountAmount")), "discountAmount")},
    ${missingIf(itemsMissing("tableItems", "items"), "tableItems")}
  ], NULL)
`;

const RESOLVED_TYPE = `COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name, '')`;
const RESOLVED_TYPE_LOWER = `lower(${RESOLVED_TYPE})`;
const RESOLVED_TYPE_COMPACT = `regexp_replace(${RESOLVED_TYPE_LOWER}, '[^a-z]', '', 'g')`;

const MISSING_FIELDS_EXPR = `
  CASE
    WHEN d.formatted_result IS NULL THEN
      CASE
        WHEN ${RESOLVED_TYPE_LOWER} LIKE '%bank statement%'
          OR ${RESOLVED_TYPE_COMPACT} LIKE '%bankstatement%'
          THEN ARRAY['bankName','accountHolderName','openingDate','closingDate','openingBalance','closingBalance','currencyCode','tableItems']
        WHEN ${RESOLVED_TYPE_LOWER} LIKE '%receipt%'
          THEN ARRAY['document_id','supplier_name','receipt_date','currency','total_amount','net_amount','vat_amount','discount','items']
        WHEN ${RESOLVED_TYPE_LOWER} LIKE '%invoice%'
          THEN ARRAY['documentId','supplierName','customerName','date','dueDate','currencyCode','totalAmount','netAmount','taxAmount','discountAmount','tableItems']
        ELSE ARRAY['documentId','date','dueDate','currencyCode','totalAmount','netAmount','taxAmount','discountAmount','tableItems']
      END
    WHEN ${RESOLVED_TYPE_LOWER} LIKE '%bank statement%'
      OR ${RESOLVED_TYPE_COMPACT} LIKE '%bankstatement%'
      THEN ${BANK_MISSING}
    WHEN ${RESOLVED_TYPE_LOWER} LIKE '%receipt%'
      THEN ${RECEIPT_MISSING}
    WHEN ${RESOLVED_TYPE_LOWER} LIKE '%invoice%'
      THEN ${INVOICE_MISSING}
    ELSE ${DEFAULT_MISSING}
  END
`;

// bug_status is only ever written by a manual (super-admin) edit, so a
// non-null stored value always means a human decided it — COALESCE lets
// that value win over the derived one, with no extra lock column needed.
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
// flagged shows as "no issue" instead of a blank cell. Filters and
// bug_status's own derivation still read the raw d.issue_type column, not
// this — "no issue" is a label, not a real category a document can be
// filtered/counted against.
const ISSUE_TYPE_EXPR = `
  COALESCE(
    d.issue_type,
    CASE WHEN d.validation = true AND d.issue_type IS NULL THEN 'no issue' END
  )
`;

export async function getDexaiUsers(filters = {}) {
  const { search = "" } = filters;

  const whereConditions = [];
  const params = [];
  let paramIndex = 1;

  if (search) {
    params.push(`%${search}%`);
    whereConditions.push(`(
      u.email ILIKE $${paramIndex}
      OR COALESCE(u.first_name, '') ILIKE $${paramIndex}
      OR COALESCE(u.last_name, '') ILIKE $${paramIndex}
    )`);
    paramIndex++;
  }

  const whereClause = whereConditions.length
    ? `WHERE ${whereConditions.join(" AND ")}`
    : "";

  const result = await dexaiQuery(
    `SELECT
       u.user_id,
       u.email,
       u.first_name,
       u.last_name,
       u.is_active,
       u.created_at,
       u.updated_at,
       u.last_login_at,
       u.company_name,
       COALESCE(stats.total_requests, 0)::int  AS total_requests,
       COALESCE(stats.completed_count, 0)::int AS completed_count,
       COALESCE(stats.failed_count, 0)::int    AS failed_count,
       stats.last_submitted_at                 AS last_submitted_at,
       STRING_AGG(DISTINCT dpr.request_id, ', ') AS request_ids,
       STRING_AGG(DISTINCT dpr.result_id, ', ') AS result_ids
     FROM users u
     LEFT JOIN document_processing_requests dpr ON u.user_id = dpr.user_id AND dpr.is_deleted = false
     LEFT JOIN (
       SELECT
         user_id,
         COUNT(*)                                                AS total_requests,
         COUNT(*) FILTER (WHERE status = 'COMPLETED')            AS completed_count,
         COUNT(*) FILTER (WHERE status = 'FAILED')               AS failed_count,
         MAX(submitted_at)                                       AS last_submitted_at
       FROM document_processing_requests
       WHERE is_deleted = false
       GROUP BY user_id
     ) stats ON stats.user_id = u.user_id
     ${whereClause}
     GROUP BY u.user_id, u.email, u.first_name, u.last_name, u.is_active, u.created_at, u.updated_at,
              u.last_login_at, u.company_name,
              stats.total_requests, stats.completed_count, stats.failed_count, stats.last_submitted_at
     ORDER BY u.company_name, u.created_at DESC NULLS LAST`,
    params
  );

  return result.rows;
}

/**
 * Fetch a single user record by user_id.
 */
export async function getDexaiUserById(userId) {
  const result = await dexaiQuery(
    `SELECT
       u.user_id,
       u.email,
       u.first_name,
       u.last_name,
       u.is_active,
       u.created_at,
       u.updated_at,
       u.last_login_at
     FROM users u
     WHERE u.user_id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

/**
 * Fetch the list of document_processing_requests belonging to a single user.
 * Excludes the heavy JSON blobs (formatted_result / processing_result) so the
 * list page loads quickly. Supports optional search and document-type filters.
 */
export async function getDexaiUserResults(userId, filters = {}) {
  const { search = "", docType = "", status = "", keyEnvironment = "", bugStatus = "", issueType = "", sortBy = "", sortOrder = "desc", page = 1, pageSize = 50 } = filters;

  const whereConditions = [
    "d.user_id = $1",
    "d.is_deleted = false",
  ];
  const params = [userId];
  let paramIndex = 2;

  if (search) {
    params.push(`%${search}%`);
    whereConditions.push(`(
      d.request_id ILIKE $${paramIndex}
      OR COALESCE(d.result_id, '') ILIKE $${paramIndex}
      OR COALESCE(d.original_filename, '') ILIKE $${paramIndex}
      OR COALESCE(d.ocr_document_type, '') ILIKE $${paramIndex}
      OR COALESCE(dt.type_name, '') ILIKE $${paramIndex}
      OR COALESCE(d.transaction_id, '') ILIKE $${paramIndex}
    )`);
    paramIndex++;
  }

  if (docType) {
    params.push(docType);
    whereConditions.push(
      `COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) = $${paramIndex}`
    );
    paramIndex++;
  }

  if (keyEnvironment) {
    params.push(keyEnvironment);
    whereConditions.push(`d.key_environment = $${paramIndex}`);
    paramIndex++;
  }

  if (issueType) {
    params.push(issueType);
    whereConditions.push(`d.issue_type = $${paramIndex}`);
    paramIndex++;
  }

  const whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  // status/bug_status are computed columns (derived in the inner query below
  // from hitl_status/validation/error/issue_type fields), so they can't be
  // filtered via whereConditions above — those run against the raw `d` row
  // before the COALESCE/CASE projection produces the displayed value. Filter
  // them in an outer WHERE against the inner subquery's own column names.
  const outerConditions = [];
  if (status) {
    params.push(status);
    outerConditions.push(`compute_status = $${paramIndex}`);
    paramIndex++;
  }
  if (bugStatus) {
    params.push(bugStatus);
    outerConditions.push(`compute_bug_status = $${paramIndex}`);
    paramIndex++;
  }
  const outerWhereClause = outerConditions.length ? `WHERE ${outerConditions.join(" AND ")}` : "";

  const safePageSize = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
  const safePage = Math.max(Number(page) || 1, 1);
  params.push(safePageSize, (safePage - 1) * safePageSize);

  const result = await dexaiQuery(
    `SELECT a.*,
    COUNT(*) OVER() AS total_count,
    CASE WHEN a.status = 'COMPLETED' then true
    WHEN a.status in ('FAILED','PROCESSING','QUEUED','NOT_PROCESSED') then null
    ELSE false END as validation
    from
    (SELECT b.*, b.compute_status AS status, b.compute_bug_status AS bug_status
     FROM (SELECT
       d.request_id,
       d.result_id,
       d.transaction_id,
       d.original_filename,
       COALESCE(
        d.hitl_status,
        CASE
          WHEN d.validation = true
            THEN 'COMPLETED'
          WHEN d.error_code is not NULL or d.error_message is not NULL
            THEN 'FAILED'
          WHEN d.processing_duration_ms IS NULL or d.result_id is NULL
            THEN 'PROCESSING'
          WHEN d.db_hitl_check = 0 AND COALESCE(array_length(${MISSING_FIELDS_EXPR}, 1), 0) = 0
            THEN 'COMPLETED'
          ELSE 'TO_BE_TESTED'
        END
      )                                                                   AS compute_status,
       ${BUG_STATUS_EXPR}                                                 AS compute_bug_status,
       ${ISSUE_TYPE_EXPR}                                             AS issue_type,
       d.issue_description,
       d.processing_duration_ms,
       d.submitted_at,
       d.created_at,
       d.updated_at,
       d.completed_at,
       d.key_environment,
       COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) AS document_type
     FROM (SELECT *, COALESCE((formatted_result::jsonb->>'hitl_check')::int, 0) AS db_hitl_check FROM document_processing_requests) d
     LEFT JOIN document_types dt ON dt.document_type_id = d.document_type_id
     ${whereClause}) b
     ${outerWhereClause}) a
    ${buildOrderByClause(sortBy, sortOrder, DEXAI_RESULTS_SORT_COLUMNS, DEXAI_RESULTS_DEFAULT_SORT)}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    params
  );

  const total = result.rows[0]?.total_count ? Number(result.rows[0].total_count) : 0;
  const rows = result.rows.map(({ total_count, ...r }) => r);
  return { rows, total };
}

/**
 * Same as getDexaiUserResults but without pagination, for CSV export of
 * every row matching the current filters. Hard-capped so a runaway filter
 * (or none at all) can't try to return a user's entire history at once.
 */
const EXPORT_ROW_CAP = 20000;

export async function getDexaiUserResultsForExport(userId, filters = {}) {
  const { search = "", docType = "", status = "", keyEnvironment = "", bugStatus = "", issueType = "", sortBy = "", sortOrder = "desc" } = filters;

  const whereConditions = [
    "d.user_id = $1",
    "d.is_deleted = false",
  ];
  const params = [userId];
  let paramIndex = 2;

  if (search) {
    params.push(`%${search}%`);
    whereConditions.push(`(
      d.request_id ILIKE $${paramIndex}
      OR COALESCE(d.result_id, '') ILIKE $${paramIndex}
      OR COALESCE(d.original_filename, '') ILIKE $${paramIndex}
      OR COALESCE(d.ocr_document_type, '') ILIKE $${paramIndex}
      OR COALESCE(dt.type_name, '') ILIKE $${paramIndex}
      OR COALESCE(d.transaction_id, '') ILIKE $${paramIndex}
    )`);
    paramIndex++;
  }

  if (docType) {
    params.push(docType);
    whereConditions.push(
      `COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) = $${paramIndex}`
    );
    paramIndex++;
  }

  if (keyEnvironment) {
    params.push(keyEnvironment);
    whereConditions.push(`d.key_environment = $${paramIndex}`);
    paramIndex++;
  }

  if (issueType) {
    params.push(issueType);
    whereConditions.push(`d.issue_type = $${paramIndex}`);
    paramIndex++;
  }

  const whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  const outerConditions = [];
  if (status) {
    params.push(status);
    outerConditions.push(`compute_status = $${paramIndex}`);
    paramIndex++;
  }
  if (bugStatus) {
    params.push(bugStatus);
    outerConditions.push(`compute_bug_status = $${paramIndex}`);
    paramIndex++;
  }
  const outerWhereClause = outerConditions.length ? `WHERE ${outerConditions.join(" AND ")}` : "";

  const result = await dexaiQuery(
    `SELECT b.*, b.compute_status AS status, b.compute_bug_status AS bug_status
     FROM (SELECT
       d.request_id,
       d.result_id,
       d.transaction_id,
       d.original_filename,
       COALESCE(
        d.hitl_status,
        CASE
          WHEN d.validation = true
            THEN 'COMPLETED'
          WHEN d.error_code is not NULL or d.error_message is not NULL
            THEN 'FAILED'
          WHEN d.processing_duration_ms IS NULL or d.result_id is NULL
            THEN 'PROCESSING'
          WHEN d.db_hitl_check = 0 AND COALESCE(array_length(${MISSING_FIELDS_EXPR}, 1), 0) = 0
            THEN 'COMPLETED'
          ELSE 'TO_BE_TESTED'
        END
      )                                                                   AS compute_status,
       ${BUG_STATUS_EXPR}                                                 AS compute_bug_status,
       ${ISSUE_TYPE_EXPR}                                             AS issue_type,
       d.issue_description,
       d.formatted_result,
       d.hitl_updated_result,
       d.processing_duration_ms,
       d.submitted_at,
       d.created_at,
       d.updated_at,
       d.completed_at,
       d.key_environment,
       COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) AS document_type
     FROM (SELECT *, COALESCE((formatted_result::jsonb->>'hitl_check')::int, 0) AS db_hitl_check FROM document_processing_requests) d
     LEFT JOIN document_types dt ON dt.document_type_id = d.document_type_id
     ${whereClause}) b
     ${outerWhereClause}
     ${buildOrderByClause(sortBy, sortOrder, DEXAI_RESULTS_EXPORT_SORT_COLUMNS, DEXAI_RESULTS_DEFAULT_SORT)}
    LIMIT ${EXPORT_ROW_CAP}`,
    params
  );

  return result.rows;
}

/**
 * Fetch the full record for one document_processing_request, including JSON
 * payloads and document file path.
 */
export async function getDexaiResultByRequestId(requestId) {
  const result = await dexaiQuery(
    `SELECT
       d.request_id,
       d.result_id,
       d.user_id,
       d.transaction_id,
       d.document_path,
       d.original_filename,
       d.file_size_bytes,
       d.file_hash,
       COALESCE(
        d.hitl_status,
        CASE
          WHEN d.validation = true
            THEN 'COMPLETED'
          WHEN d.error_code is not NULL or d.error_message is not NULL
            THEN 'FAILED'
          WHEN d.processing_duration_ms IS NULL or d.result_id is NULL
            THEN 'PROCESSING'
          WHEN d.db_hitl_check = 0 AND COALESCE(array_length(${MISSING_FIELDS_EXPR}, 1), 0) = 0
            THEN 'COMPLETED'
          ELSE 'TO_BE_TESTED'
        END
      )                                                   AS status,
       d.error_message,
       d.error_code,
       d.processing_duration_ms,
       d.submitted_at,
       d.queued_at,
       d.started_at,
       d.completed_at,
       d.created_at,
       d.updated_at,
       d.formatted_result,
       d.hitl_updated_result,
       d.processing_result,
       d.key_environment,
       ${ISSUE_TYPE_EXPR}                                             AS issue_type,
       d.issue_description,
       ${BUG_STATUS_EXPR}                                             AS bug_status,
       COALESCE(d.comments::jsonb, '[]'::jsonb)                       AS comments,
       COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) AS document_type,
       u.email      AS user_email,
       u.first_name AS user_first_name,
       u.last_name  AS user_last_name
     FROM (SELECT *, COALESCE((formatted_result::jsonb->>'hitl_check')::int, 0) AS db_hitl_check FROM document_processing_requests) d
     LEFT JOIN document_types dt ON dt.document_type_id = d.document_type_id
     LEFT JOIN users u           ON u.user_id           = d.user_id
     WHERE d.request_id = $1
       AND d.is_deleted = false`,
    [requestId]
  );
  return result.rows[0] || null;
}

/**
 * Fetch all client users (every row in the `users` table) who have accessed
 * the HITL portal, with their login and creation info.
 * Returns: first_name, last_name, email, company_name, created_at, updated_at, last_login_at
 */
export async function getClients(filters = {}) {
  const { search = "", sortBy = "last_login_at", sortOrder = "DESC" } = filters;

  const whereConditions = [];
  const params = [];
  let paramIndex = 1;

  if (search) {
    params.push(`%${search}%`);
    whereConditions.push(`(
      u.email ILIKE $${paramIndex}
      OR COALESCE(u.first_name, '') ILIKE $${paramIndex}
      OR COALESCE(u.last_name, '') ILIKE $${paramIndex}
      OR COALESCE(u.company_name, '') ILIKE $${paramIndex}
    )`);
    paramIndex++;
  }

  const whereClause = whereConditions.length ? `WHERE ${whereConditions.join(" AND ")}` : "";

  // Validate sort column to prevent SQL injection
  const validSortColumns = ["first_name", "last_name", "email", "created_at", "updated_at", "last_login_at", "company_name"];
  const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : "last_login_at";
  const safeOrder = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";

  const result = await dexaiQuery(
    `SELECT
       u.user_id,
       u.first_name,
       u.last_name,
       u.email,
       u.created_at,
       u.updated_at,
       u.last_login_at,
       u.company_name,
       COALESCE(stats.total_requests, 0)::int AS total_requests
     FROM users u
     LEFT JOIN (
       SELECT
         user_id,
         COUNT(*) FILTER (WHERE is_deleted = false) AS total_requests
       FROM document_processing_requests
       GROUP BY user_id
     ) stats ON stats.user_id = u.user_id
     ${whereClause}
     ORDER BY ${safeSortBy} ${safeOrder} NULLS LAST`,
    params
  );

  return result.rows;
}
