import { dexaiQuery as query } from "./dexaidb.js";
import { buildOrderByClause } from "./sort.js";

const MISSING_FIELDS_SORT_COLUMNS = new Set([
  "result_id", "ocr_document_type", "key_environment", "missing_count",
  "hitl_status", "validation", "bug_status", "issue_type", "created_at",
]);

/**
 * Source of truth is document_processing_requests (alias `d`). It carries the
 * original upload (document_path), the OCR payloads (formatted_result,
 * processing_result), the result_id, status, and timestamps. document_types
 * (alias `dt`) is joined for the human-readable type name when the request
 * row doesn't carry one. Everything runs against the single MAIN_FINANCE_DB
 * pool (lib/dexaidb.js).
 */
const DOC_FROM = `
  FROM document_processing_requests d
  LEFT JOIN document_types dt ON dt.document_type_id = d.document_type_id
  LEFT JOIN users u ON u.user_id = d.user_id
`;

/**
 * Client email excluded from every admin-facing query below (document list,
 * missing-fields table, and filter dropdowns). Data is left untouched in the
 * DB — this only keeps the client out of what the admin UI surfaces.
 */
const HIDDEN_CLIENT_EMAIL = "john@example.com";

/**
 * Fetch the document list for the sidebar. Only the columns the sidebar
 * actually renders — the OCR JSON blobs are deliberately excluded so we
 * don't ship megabytes just to draw a list of IDs.
 */
export async function getDocumentList() {
  const result = await query(
    `SELECT
       d.result_id AS result_id,
       d.transaction_id AS transaction_id,
       COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) AS ocr_document_type
     ${DOC_FROM}
     WHERE d.is_deleted = false
       AND d.status = 'COMPLETED'
       AND d.result_id IS NOT NULL
       AND (u.email IS NULL OR lower(u.email) <> lower($1))
     ORDER BY d.submitted_at DESC`,
    [HIDDEN_CLIENT_EMAIL]
  );

  return result.rows.map((r) => ({
    id: r.result_id,
    result_id: r.result_id,
    transaction_id: r.transaction_id,
    ocr_document_type: r.ocr_document_type,
  }));
}

/**
 * Fetch a single document row by result_id.
 */
export async function getDocumentById(id) {
  const result = await query(
    `SELECT
       d.result_id                                                    AS id,
       d.request_id                                                   AS request_id,
       d.transaction_id                                               AS transaction_id,
       COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) AS ocr_document_type,
       d.document_path                                                AS source_file,
       d.formatted_result                                             AS ocr_results,
       d.hitl_updated_result                                          AS hitl_updated_result,
       d.processing_result                                            AS processing_result,
       d.status,
       d.validation,
       d.hitl_status,
       ${ISSUE_TYPE_EXPR} AS issue_type,
       d.issue_description,
       ${BUG_STATUS_EXPR} AS bug_status,
       COALESCE(d.comments::jsonb, '[]'::jsonb) AS comments,
       d.submitted_at,
       d.completed_at,
       d.key_environment
     ${DOC_FROM}
     WHERE d.result_id = $1
       AND d.is_deleted = false`,
    [id]
  );

  const row = result.rows[0];
  if (!row) return null;
  return { ...row, result_id: row.id };
}

/**
 * Update the formatted_result column for a result row.
 * @param {string} id - result_id
 * @param {object} uiResults - Parsed JSON object to store
 */
export async function updateUiResults(id, uiResults) {
  const result = await query(
    `UPDATE document_processing_requests
     SET formatted_result = $1::json,
         updated_at = CURRENT_TIMESTAMP
     WHERE result_id = $2
     RETURNING result_id AS id, formatted_result AS ocr_results`,
    [JSON.stringify(uiResults), id]
  );
  return result.rows[0] || null;
}

/**
 * Publish the HITL-corrected result. Writes the human-corrected copy to
 * hitl_updated_result (the original formatted_result is left untouched) and
 * finalizes the row: status + hitl_status -> COMPLETED and validation -> true.
 * @param {string} id - result_id
 * @param {object} hitlResults - Parsed JSON object to store
 */
export async function updateHitlResult(id, hitlResults) {
  const result = await query(
    `UPDATE document_processing_requests
     SET hitl_updated_result = $1::json,
         status = 'COMPLETED',
         hitl_status = 'COMPLETED',
         validation = true,
         result_version = COALESCE(result_version, 1) + 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE result_id = $2
     RETURNING result_id   AS id,
               request_id  AS request_id,
               user_id     AS user_id,
               result_version,
               hitl_updated_result AS hitl_results`,
    [JSON.stringify(hitlResults), id]
  );
  return result.rows[0] || null;
}

/**
 * Resolve a reprocess target by EITHER result_id or request_id. The two viewer
 * pages key documents differently (the audit view uses request_id, the sidebar
 * viewer uses result_id) and the two id formats don't collide, so we match on
 * whichever column equals the given id.
 *
 * @param {string} idOrRequestId
 * @returns {Promise<{result_id: string, request_id: string, source_file: string, document_type: string}|null>}
 */
export async function getReprocessTarget(idOrRequestId) {
  const result = await query(
    `SELECT
       d.result_id                                                    AS result_id,
       d.request_id                                                   AS request_id,
       d.document_path                                                AS source_file,
       COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) AS document_type
     ${DOC_FROM}
     WHERE (d.result_id = $1 OR d.request_id = $1)
       AND d.is_deleted = false
     LIMIT 1`,
    [idOrRequestId]
  );
  return result.rows[0] || null;
}

/**
 * Poll the status of a (temporary) reprocessing request by request_id.
 *
 * The reprocess flow submits the document to the external /process-document
 * endpoint, which creates a brand-new, transient request row. We watch that
 * row's status here until it reaches a terminal state (COMPLETED / FAILED).
 * `has_result` distinguishes "row exists, still working" from "row exists and
 * the extraction has landed".
 *
 * @param {string} requestId - the transient request_id returned by the OCR API
 */
export async function getRequestStatus(requestId) {
  const result = await query(
    `SELECT
       d.request_id                                     AS request_id,
       d.status                                         AS status,
       d.error_message                                  AS error_message,
       (d.formatted_result IS NOT NULL)                 AS has_result
     FROM document_processing_requests d
     WHERE d.request_id = $1`,
    [requestId]
  );
  return result.rows[0] || null;
}

/**
 * Finalize a reprocess: copy the freshly-extracted result off the transient
 * request row (`newRequestId`) onto the original document row (`resultId`),
 * keeping the ORIGINAL request_id intact. HITL edits are intentionally reset —
 * hitl_updated_result is re-seeded from the new formatted_result — because the
 * extraction has been redone from scratch (see the reprocess design decision).
 * The transient row is then soft-deleted so it never surfaces in the sidebar.
 *
 * Both the source row (COMPLETED) and the destination row must exist or the
 * copy affects zero rows and we report failure to the caller.
 *
 * @param {object} args
 * @param {string} args.targetId      - result_id OR request_id of the document being overwritten
 * @param {string} args.newRequestId  - transient request_id holding the new result
 * @param {string} args.documentType  - the type the user reprocessed as
 * @returns {Promise<{id: string}|null>} the overwritten row, or null if nothing matched
 */


/**
 * Missing-mandatory-field detection done entirely in SQL — the formatted_result
 * blobs (~10 MB across all rows on the remote DB) never leave the database, so
 * the API/browser only sees a lean array of missing field names per row.
 *
 * Each per-doc-type CASE block lists the same mandatory keys the analyzer
 * UI requires — keep the two in sync if you change one.
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

/**
 * Build the missing_fields array expression for one doc type. Returns SQL that
 * evaluates to a text[] of missing field names (or empty array).
 */
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

// Exported: lib/hitlAssignment.js reuses this verbatim so its "does this row
// still need a human" check can never drift from what this file computes.
export const MISSING_FIELDS_EXPR = `
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

// Derives the displayed `validation` boolean from `compute_status` (the
// inner subquery's column, referenced here rather than d.validation so it
// stays consistent with hitl_status). Shared by the outer SELECT and the
// validation filter below so the filter can never drift from what's shown.
const VALIDATION_EXPR = `
  CASE WHEN compute_status is null THEN null
  WHEN compute_status = 'COMPLETED' THEN true
  WHEN compute_status IN ('FAILED', 'PROCESSING', 'QUEUED', 'NOT_PROCESSED') THEN null
  ELSE false END
`;


export async function commitReprocessedResult({ targetId, newRequestId, documentType }) {
  const copied = await query(
    `UPDATE document_processing_requests old
        SET processing_result   = src.processing_result,
            formatted_result    = src.formatted_result,
            hitl_updated_result = src.hitl_updated_result,
            ocr_document_type   = $3,
            status              = src.status,
            -- A prior failed attempt's error_code/error_message must not
            -- linger once a reprocess succeeds cleanly (src's values are
            -- NULL in that case) -- these were never copied before, so a
            -- fixed document could still show its old error.
            error_code          = src.error_code,
            error_message       = src.error_message,
            hitl_status         = src.compute_status,
            validation          = CASE WHEN src.compute_status is null THEN null WHEN src.compute_status = 'COMPLETED' THEN true WHEN src.compute_status IN ('FAILED', 'PROCESSING', 'QUEUED', 'NOT_PROCESSED') THEN null ELSE false END,
            result_version      = COALESCE(old.result_version, 1) + 1,
            completed_at        = CURRENT_TIMESTAMP,
            updated_at          = CURRENT_TIMESTAMP
       FROM (SELECT *, COALESCE(
        d.hitl_status,
        CASE
          WHEN d.validation = true
            THEN 'COMPLETED'
          WHEN d.error_code is not NULL or d.error_message is not NULL
            THEN 'FAILED'
          WHEN d.processing_duration_ms IS NULL or d.result_id is NULL
            THEN 'PROCESSING'
          WHEN COALESCE((d.formatted_result::jsonb->>'hitl_check')::int, 0) = 0 AND COALESCE(array_length(${MISSING_FIELDS_EXPR}, 1), 0) = 0
            THEN 'COMPLETED'
          ELSE 'TO_BE_TESTED'
        END
        ) AS compute_status ${DOC_FROM}) src
      WHERE (old.result_id = $1 OR old.request_id = $1)
        AND src.request_id = $2
        AND src.status = 'COMPLETED'
      RETURNING old.result_id AS id, old.request_id AS request_id, old.hitl_status, old.validation`,
    [targetId, newRequestId, documentType]
  );

  const row = copied.rows[0];
  if (!row) return null;

  // Retire the transient request so it doesn't clutter history/sidebar.
  await query(
    `UPDATE document_processing_requests
        SET is_deleted = true,
            deleted_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
      WHERE request_id = $1`,
    [newRequestId]
  );

  return row;
}

/**
 * Fetch documents with their missing-mandatory-field metadata computed in
 * SQL. Optional search and document-type filters.
 *
 * Returns lean rows: { id, request_id, ocr_document_type, created_at,
 * missing_fields[], missing_count }. The raw OCR JSON is never returned, so
 * the response stays small even with 15k+ rows.
 *
 * @param {object} filters - { search, docType, showAll, clientId, businessName, status, keyEnvironment, hitlUserId, validation, page, pageSize }
 * @returns {Promise<{rows: object[], total: number}>}
 */
export async function getDocumentsWithMissingFields(filters = {}) {
  const { search = "", docType = "", showAll = false, clientId = "", businessName = "", status = "", keyEnvironment = "", bugStatus = "", issueType = "", hitlUserId = "", validation = "", sortBy = "", sortOrder = "desc", page = 1, pageSize = 50 } = filters;

  const whereConditions = [
    "d.is_deleted = false",
    "d.result_id IS NOT NULL",
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

  if (clientId) {
    params.push(clientId);
    whereConditions.push(`d.user_id = $${paramIndex}`);
    paramIndex++;
  }

  if (businessName === "NULL") {
    whereConditions.push(`COALESCE(BTRIM(u.company_name), '') = ''`);
  } else if (businessName) {
    params.push(businessName);
    whereConditions.push(`COALESCE(BTRIM(u.company_name), '') = $${paramIndex}`);
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

  if (hitlUserId === "UNASSIGNED") {
    whereConditions.push(`d.hitl_assigned_to IS NULL`);
  } else if (hitlUserId) {
    params.push(hitlUserId);
    whereConditions.push(`d.hitl_assigned_to = $${paramIndex}`);
    paramIndex++;
  }

  const whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  // hitl_status/missing_fields/bug_status are computed columns (derived in
  // the inner query below), so they can only be filtered in an outer WHERE,
  // not whereConditions above. When showAll=false, push the "has at least
  // one missing field" filter out here too so we only pay the JSON scan once.
  const outerConditions = [];
  if (!showAll) {
    outerConditions.push("COALESCE(array_length(missing_fields, 1), 0) > 0");
  }
  if (status) {
    params.push(status);
    // The outer SELECT renames this column to hitl_status, but this WHERE
    // clause filters rows of the derived table `t` before that projection
    // happens, so it must use the inner subquery's own column name.
    outerConditions.push(`compute_status = $${paramIndex}`);
    paramIndex++;
  }
  if (bugStatus) {
    params.push(bugStatus);
    outerConditions.push(`compute_bug_status = $${paramIndex}`);
    paramIndex++;
  }
  // validation is derived from compute_status (see VALIDATION_EXPR) rather
  // than the raw d.validation column, so it's filtered the same way as
  // status/bug_status above -- against `t`'s columns, not a bound param
  // (the value is one of a fixed "true"/"false"/"null" set from the
  // dropdown, never arbitrary user text, so inlining it is safe).
  if (validation === "true") {
    outerConditions.push(`(${VALIDATION_EXPR}) = true`);
  } else if (validation === "false") {
    outerConditions.push(`(${VALIDATION_EXPR}) = false`);
  } else if (validation === "null") {
    outerConditions.push(`(${VALIDATION_EXPR}) IS NULL`);
  }
  const outerWhereClause = outerConditions.length ? `WHERE ${outerConditions.join(" AND ")}` : "";

  const safePageSize = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
  const safePage = Math.max(Number(page) || 1, 1);
  const limitParamIndex = paramIndex;
  const offsetParamIndex = paramIndex + 1;
  params.push(safePageSize, (safePage - 1) * safePageSize);

  const sql = `
    SELECT
      COUNT(*) OVER() AS total_count,
      result_id,
      request_id,
      transaction_id,
      ocr_document_type,
      -- HITL status logic:
      --   validation = true                    -> COMPLETED  (passed mandatory-field validation)
      --   formatted_result IS NULL             -> raw pipeline status (PENDING/PROCESSING/...) - not processed yet, not a HITL judgment
      --   error_code present                   -> FAILED
      --   hitl_check 0 AND no missing fields   -> COMPLETED
      --   hitl_check 0 AND some missing fields -> TO_BE_TESTED
      --   hitl_check 1 (regardless of missing) -> TO_BE_TESTED
      -- A manually-set status (db_hitl_status) still takes precedence.
      compute_status                  AS hitl_status,
      created_at,
      submitted_at,
      updated_at,
      -- Keep validation consistent with the HITL status: COMPLETED -> true,
      -- still-processing states -> null (not yet judged), everything else -> false.
      ${VALIDATION_EXPR} AS validation,
      missing_fields,
      client_id,
      hitl_assigned_to,
      client_name,
      client_email,
      business_name,
      key_environment,
      issue_type,
      issue_description,
      compute_bug_status              AS bug_status,
      COALESCE(array_length(missing_fields, 1), 0) AS missing_count
    FROM (
      SELECT
        d.result_id                                                    AS result_id,
        d.request_id                                                   AS request_id,
        d.transaction_id                                               AS transaction_id,
        COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) AS ocr_document_type,
        d.key_environment                                              AS key_environment,
        COALESCE(d.submitted_at, d.created_at, d.completed_at)         AS created_at,
        d.submitted_at                                                 AS submitted_at,
        d.updated_at                                                   AS updated_at,
        d.user_id                                                      AS client_id,
        d.hitl_assigned_to                                             AS hitl_assigned_to,
        COALESCE(
        d.hitl_status,
        CASE
          WHEN d.validation = true
            THEN 'COMPLETED'
          WHEN d.error_code is not NULL or d.error_message is not NULL
            THEN 'FAILED'
          WHEN d.processing_duration_ms IS NULL or d.result_id is NULL
            THEN 'PROCESSING'
          WHEN COALESCE((d.formatted_result::jsonb->>'hitl_check')::int, 0) = 0 AND COALESCE(array_length(${MISSING_FIELDS_EXPR}, 1), 0) = 0
            THEN 'COMPLETED'
          ELSE 'TO_BE_TESTED'
        END
        )                                                             AS compute_status,
        COALESCE((d.formatted_result::jsonb->>'hitl_check')::int, 0) AS db_hitl_check,
        NULLIF(BTRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), '') AS client_name,
        u.email                                                        AS client_email,
        NULLIF(BTRIM(COALESCE(u.company_name, '')), '')                AS business_name,
        ${MISSING_FIELDS_EXPR}                                         AS missing_fields,
        ${ISSUE_TYPE_EXPR}                                             AS issue_type,
        d.issue_description                                            AS issue_description,
        ${BUG_STATUS_EXPR}                                             AS compute_bug_status,
        d.error_code
      ${DOC_FROM}
      ${whereClause}
    ) t
    ${outerWhereClause}
    ${buildOrderByClause(sortBy, sortOrder, MISSING_FIELDS_SORT_COLUMNS, "created_at")}
    LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
  `;

  const result = await query(sql, params);
  const total = result.rows[0]?.total_count ? Number(result.rows[0].total_count) : 0;
  const rows = result.rows.map(({ total_count, ...r }) => ({ ...r, id: r.result_id }));
  return { rows, total };
}

/**
 * Same as getDocumentsWithMissingFields but without pagination, for CSV
 * export of every row matching the current filters. Hard-capped so a
 * runaway filter (or none at all) can't try to return the whole table.
 */
const EXPORT_ROW_CAP = 20000;

export async function getDocumentsWithMissingFieldsForExport(filters = {}) {
  const { search = "", docType = "", showAll = true, clientId = "", businessName = "", status = "", keyEnvironment = "", bugStatus = "", issueType = "", hitlUserId = "", validation = "", sortBy = "", sortOrder = "desc", limit = EXPORT_ROW_CAP } = filters;

  const whereConditions = [
    "d.is_deleted = false",
    "d.result_id IS NOT NULL",
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

  if (clientId) {
    params.push(clientId);
    whereConditions.push(`d.user_id = $${paramIndex}`);
    paramIndex++;
  }

  if (businessName === "NULL") {
    whereConditions.push(`COALESCE(BTRIM(u.company_name), '') = ''`);
  } else if (businessName) {
    params.push(businessName);
    whereConditions.push(`COALESCE(BTRIM(u.company_name), '') = $${paramIndex}`);
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

  if (hitlUserId === "UNASSIGNED") {
    whereConditions.push(`d.hitl_assigned_to IS NULL`);
  } else if (hitlUserId) {
    params.push(hitlUserId);
    whereConditions.push(`d.hitl_assigned_to = $${paramIndex}`);
    paramIndex++;
  }

  const whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  const outerConditions = [];
  if (!showAll) {
    outerConditions.push("COALESCE(array_length(missing_fields, 1), 0) > 0");
  }
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
  if (validation === "true") {
    outerConditions.push(`(${VALIDATION_EXPR}) = true`);
  } else if (validation === "false") {
    outerConditions.push(`(${VALIDATION_EXPR}) = false`);
  } else if (validation === "null") {
    outerConditions.push(`(${VALIDATION_EXPR}) IS NULL`);
  }
  const outerWhereClause = outerConditions.length ? `WHERE ${outerConditions.join(" AND ")}` : "";

  const sql = `
    SELECT
      result_id,
      request_id,
      transaction_id,
      ocr_document_type,
      compute_status                  AS hitl_status,
      created_at,
      key_environment,
      client_name,
      client_email,
      business_name,
      issue_type,
      issue_description,
      compute_bug_status              AS bug_status,
      formatted_result,
      hitl_updated_result,
      document_path,
      COALESCE(array_length(missing_fields, 1), 0) AS missing_count
    FROM (
      SELECT
        d.result_id                                                    AS result_id,
        d.request_id                                                   AS request_id,
        d.transaction_id                                               AS transaction_id,
        COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) AS ocr_document_type,
        d.key_environment                                              AS key_environment,
        COALESCE(d.submitted_at, d.created_at, d.completed_at)         AS created_at,
        d.formatted_result                                             AS formatted_result,
        d.hitl_updated_result                                          AS hitl_updated_result,
        d.document_path                                                AS document_path,
        COALESCE(
        d.hitl_status,
        CASE
          WHEN d.validation = true
            THEN 'COMPLETED'
          WHEN d.error_code is not NULL or d.error_message is not NULL
            THEN 'FAILED'
          WHEN d.processing_duration_ms IS NULL or d.result_id is NULL
            THEN 'PROCESSING'
          WHEN COALESCE((d.formatted_result::jsonb->>'hitl_check')::int, 0) = 0 AND COALESCE(array_length(${MISSING_FIELDS_EXPR}, 1), 0) = 0
            THEN 'COMPLETED'
          ELSE 'TO_BE_TESTED'
        END
        )                                                             AS compute_status,
        NULLIF(BTRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), '') AS client_name,
        u.email                                                        AS client_email,
        NULLIF(BTRIM(COALESCE(u.company_name, '')), '')                AS business_name,
        ${MISSING_FIELDS_EXPR}                                         AS missing_fields,
        ${ISSUE_TYPE_EXPR}                                             AS issue_type,
        d.issue_description                                            AS issue_description,
        ${BUG_STATUS_EXPR}                                             AS compute_bug_status
      ${DOC_FROM}
      ${whereClause}
    ) t
    ${outerWhereClause}
    ${buildOrderByClause(sortBy, sortOrder, MISSING_FIELDS_SORT_COLUMNS, "created_at")}
    LIMIT ${Number(limit) || EXPORT_ROW_CAP}
  `;

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Write the manually-editable bug-tracking fields for one row. bugStatus is
 * only ever included in the SQL (and hence only ever persisted) when the
 * caller has already confirmed the current user is SUPER_ADMIN -- callers
 * that only pass issueType/issueDescription never touch bug_status.
 */
export async function updateBugTracking(resultId, { issueType, issueDescription, bugStatus } = {}) {
  // Only touch columns the caller actually included -- e.g. selecting the
  // issue type alone must not also overwrite issue_description with null.
  const setClauses = ["updated_at = CURRENT_TIMESTAMP"];
  const params = [];

  if (issueType !== undefined) {
    params.push(issueType);
    setClauses.push(`issue_type = $${params.length}`);
    // bug_flagged_at records the first time this row ever got an issue_type
    // (i.e. first showed up in the Bug Tracker tab), stamped once and never
    // overwritten. `issue_type` on the right-hand side reads the row's
    // pre-update value (Postgres evaluates every SET expression against the
    // old row), so this only fires the moment issue_type goes from NULL to
    // set -- clearing it back to null later doesn't touch bug_flagged_at.
    setClauses.push(`bug_flagged_at = COALESCE(bug_flagged_at, CASE WHEN issue_type IS NULL THEN CURRENT_TIMESTAMP END)`);
  }
  if (issueDescription !== undefined) {
    params.push(issueDescription);
    setClauses.push(`issue_description = $${params.length}`);
  }
  if (bugStatus !== undefined) {
    params.push(bugStatus);
    setClauses.push(`bug_status = $${params.length}`);
  }

  params.push(resultId);
  const result = await query(
    `UPDATE document_processing_requests
        SET ${setClauses.join(", ")}
      WHERE result_id = $${params.length}
      RETURNING result_id AS id, issue_type, issue_description, bug_status, bug_flagged_at`,
    params
  );
  return result.rows[0] || null;
}

/**
 * Append a comment to a row's `comments` JSON array. The next `id` is
 * computed atomically in the same UPDATE (max existing id + 1, scoped to
 * this row only) — the row-level lock an UPDATE takes means a concurrent
 * add to the same document waits for this one to commit first, so two
 * comments on the same document can never collide on the same id.
 */
export async function addComment(resultId, { username, message }) {
  const result = await query(
    `UPDATE document_processing_requests
        SET comments = (
          COALESCE(comments::jsonb, '[]'::jsonb) || jsonb_build_array(
            jsonb_build_object(
              'id', (
                SELECT COALESCE(MAX((elem->>'id')::int), 0) + 1
                FROM jsonb_array_elements(COALESCE(comments::jsonb, '[]'::jsonb)) elem
              ),
              'username', $1::text,
              'message', $2::text,
              'timestamp', $3::text
            )
          )
        ),
        updated_at = CURRENT_TIMESTAMP
      WHERE result_id = $4
      RETURNING comments`,
    [username, message, new Date().toISOString(), resultId]
  );
  return result.rows[0]?.comments ?? null;
}

/**
 * Fetch a single comment by its per-document id, for the ownership check in
 * the edit/delete routes (only the original author may edit/delete).
 */
export async function getComment(resultId, commentId) {
  const result = await query(
    `SELECT elem AS comment
     FROM document_processing_requests d,
          jsonb_array_elements(COALESCE(d.comments::jsonb, '[]'::jsonb)) elem
     WHERE d.result_id = $1
       AND (elem->>'id')::int = $2::int`,
    [resultId, commentId]
  );
  return result.rows[0]?.comment ?? null;
}

/** Edit the message of one comment (matched by its per-document id). */
export async function updateComment(resultId, commentId, message) {
  const result = await query(
    `UPDATE document_processing_requests
        SET comments = (
          SELECT COALESCE(jsonb_agg(
            CASE WHEN (elem->>'id')::int = $1::int
              THEN elem || jsonb_build_object('message', $2::text)
              ELSE elem
            END
          ), '[]'::jsonb)
          FROM jsonb_array_elements(COALESCE(comments::jsonb, '[]'::jsonb)) elem
        ),
        updated_at = CURRENT_TIMESTAMP
      WHERE result_id = $3
      RETURNING comments`,
    [commentId, message, resultId]
  );
  return result.rows[0]?.comments ?? null;
}

/** Remove one comment (matched by its per-document id). */
export async function deleteComment(resultId, commentId) {
  const result = await query(
    `UPDATE document_processing_requests
        SET comments = (
          SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
          FROM jsonb_array_elements(COALESCE(comments::jsonb, '[]'::jsonb)) elem
          WHERE (elem->>'id')::int != $1::int
        ),
        updated_at = CURRENT_TIMESTAMP
      WHERE result_id = $2
      RETURNING comments`,
    [commentId, resultId]
  );
  return result.rows[0]?.comments ?? null;
}

/**
 * All users and their distinct company names for the HITL EDIT filter dropdowns.
 * Queries users directly so dropdowns are always populated even when
 * document_processing_requests rows have no user_id.
 */
export async function getFilterOptions() {
  const [usersResult, docTypesResult, keyEnvsResult] = await Promise.all([
    query(
      `SELECT
         user_id                                                           AS client_id,
         email                                                             AS client_email,
         NULLIF(BTRIM(CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,''))), '') AS client_name,
         NULLIF(BTRIM(COALESCE(company_name, '')), '')                     AS business_name
       FROM users
       WHERE email IS NULL OR lower(email) <> lower($1)
       ORDER BY company_name NULLS LAST, first_name NULLS LAST`,
      [HIDDEN_CLIENT_EMAIL]
    ),
    query(
      `SELECT DISTINCT COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) AS doc_type
       ${DOC_FROM}
       WHERE d.is_deleted = false
         AND (u.email IS NULL OR lower(u.email) <> lower($1))
         AND COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) IS NOT NULL
       ORDER BY doc_type`,
      [HIDDEN_CLIENT_EMAIL]
    ),
    query(
      `SELECT DISTINCT d.key_environment AS key_environment
       ${DOC_FROM}
       WHERE d.is_deleted = false
         AND (u.email IS NULL OR lower(u.email) <> lower($1))
         AND d.key_environment IS NOT NULL
       ORDER BY key_environment`,
      [HIDDEN_CLIENT_EMAIL]
    ),
  ]);

  const clients = usersResult.rows.map((r) => ({
    id: r.client_id,
    label: r.client_name || r.client_email || String(r.client_id),
    email: r.client_email,
  }));

  const businesses = [
    ...new Set(usersResult.rows.map((r) => r.business_name).filter(Boolean)),
  ].sort();

  const docTypes = docTypesResult.rows.map((r) => r.doc_type).filter(Boolean);
  const keyEnvironments = keyEnvsResult.rows.map((r) => r.key_environment).filter(Boolean);

  return { clients, businesses, docTypes, keyEnvironments };
}
