import { dexaiQuery as query } from "./dexaidb";

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


export async function commitReprocessedResult({ targetId, newRequestId, documentType }) {
  const copied = await query(
    `UPDATE document_processing_requests old
        SET processing_result   = src.processing_result,
            formatted_result    = src.formatted_result,
            hitl_updated_result = src.hitl_updated_result,
            ocr_document_type   = $3,
            status              = src.status,
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
      RETURNING old.result_id AS id, old.request_id AS request_id`,
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
 * @param {object} filters - { search, docType, showAll, clientId, businessName, status, keyEnvironment, page, pageSize }
 * @returns {Promise<{rows: object[], total: number}>}
 */
export async function getDocumentsWithMissingFields(filters = {}) {
  const { search = "", docType = "", showAll = false, clientId = "", businessName = "", status = "", keyEnvironment = "", page = 1, pageSize = 50 } = filters;

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

  if (businessName) {
    params.push(businessName);
    whereConditions.push(`COALESCE(BTRIM(u.company_name), '') = $${paramIndex}`);
    paramIndex++;
  }

  if (keyEnvironment) {
    params.push(keyEnvironment);
    whereConditions.push(`d.key_environment = $${paramIndex}`);
    paramIndex++;
  }

  const whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  // hitl_status/missing_fields are computed columns (derived in the inner
  // query below), so they can only be filtered in an outer WHERE, not
  // whereConditions above. When showAll=false, push the "has at least one
  // missing field" filter out here too so we only pay the JSON scan once.
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
      CASE WHEN compute_status is null THEN null
      WHEN compute_status = 'COMPLETED' THEN true
      WHEN compute_status IN ('FAILED', 'PROCESSING', 'QUEUED', 'NOT_PROCESSED') THEN null
      ELSE false END AS validation,
      missing_fields,
      client_id,
      hitl_assigned_to,
      client_name,
      client_email,
      business_name,
      key_environment,
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
        d.error_code
      ${DOC_FROM}
      ${whereClause}
    ) t
    ${outerWhereClause}
    ORDER BY created_at DESC NULLS LAST
    LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
  `;

  const result = await query(sql, params);
  const total = result.rows[0]?.total_count ? Number(result.rows[0].total_count) : 0;
  const rows = result.rows.map(({ total_count, ...r }) => ({ ...r, id: r.result_id }));
  return { rows, total };
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
