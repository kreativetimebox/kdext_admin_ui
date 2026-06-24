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
     ORDER BY d.submitted_at DESC`,
    []
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
       d.submitted_at,
       d.completed_at
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
         updated_at = CURRENT_TIMESTAMP
     WHERE result_id = $2
     RETURNING result_id AS id, hitl_updated_result AS hitl_results`,
    [JSON.stringify(hitlResults), id]
  );
  return result.rows[0] || null;
}

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

/**
 * Fetch documents with their missing-mandatory-field metadata computed in
 * SQL. Optional search and document-type filters.
 *
 * Returns lean rows: { id, request_id, ocr_document_type, created_at,
 * missing_fields[], missing_count }. The raw OCR JSON is never returned, so
 * the response stays small even with 15k+ rows.
 *
 * @param {object} filters - { search, docType, showAll, clientId, businessName, status }
 */
export async function getDocumentsWithMissingFields(filters = {}) {
  const { search = "", docType = "", showAll = false, clientId = "", businessName = "", status = "" } = filters;

  const whereConditions = [
    "d.is_deleted = false",
    "d.result_id IS NOT NULL",
  ];
  const params = [];
  let paramIndex = 1;

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


  const whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  // When showAll=false, push the "has at least one missing field" filter into
  // the outer query so we only pay the JSON scan once.
  const havingClause = showAll
    ? ""
    : "WHERE COALESCE(array_length(missing_fields, 1), 0) > 0";

  const sql = `
    SELECT
      result_id,
      request_id,
      transaction_id,
      ocr_document_type,
      -- HITL status logic:
      --   validation = true                    -> COMPLETED  (passed mandatory-field validation)
      --   hitl_check 0 AND no missing fields   -> COMPLETED
      --   hitl_check 0 AND some missing fields -> TO_BE_TESTED
      --   hitl_check 1 (regardless of missing) -> TO_BE_TESTED
      -- A manually-set status (db_hitl_status) still takes precedence.
      COALESCE(
        db_hitl_status,
        CASE
          WHEN validation = true
            THEN 'COMPLETED'
          WHEN db_hitl_check = 0 AND COALESCE(array_length(missing_fields, 1), 0) = 0
            THEN 'COMPLETED'
          ELSE 'TO_BE_TESTED'
        END
      )                                                                   AS hitl_status,
      created_at,
      submitted_at,
      updated_at,
      validation,
      missing_fields,
      client_id,
      hitl_assigned_to,
      client_name,
      client_email,
      business_name,
      COALESCE(array_length(missing_fields, 1), 0) AS missing_count
    FROM (
      SELECT
        d.result_id                                                    AS result_id,
        d.request_id                                                   AS request_id,
        d.transaction_id                                               AS transaction_id,
        COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) AS ocr_document_type,
        COALESCE(d.submitted_at, d.created_at, d.completed_at)         AS created_at,
        d.submitted_at                                                 AS submitted_at,
        d.updated_at                                                   AS updated_at,
        d.user_id                                                      AS client_id,
        d.hitl_assigned_to                                             AS hitl_assigned_to,
        d.hitl_status                                                AS db_hitl_status,
        d.validation                                                 AS validation,
        COALESCE((d.formatted_result::jsonb->>'hitl_check')::int, 0) AS db_hitl_check,
        NULLIF(BTRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), '') AS client_name,
        u.email                                                        AS client_email,
        NULLIF(BTRIM(COALESCE(u.company_name, '')), '')                AS business_name,
        ${MISSING_FIELDS_EXPR}                                         AS missing_fields
      ${DOC_FROM}
      ${whereClause}
    ) t
    ${havingClause}
    ORDER BY created_at DESC NULLS LAST
  `;

  const result = await query(sql, params);
  return result.rows.map((r) => ({ ...r, id: r.result_id }));
}

/**
 * All users and their distinct company names for the HITL EDIT filter dropdowns.
 * Queries users directly so dropdowns are always populated even when
 * document_processing_requests rows have no user_id.
 */
export async function getFilterOptions() {
  const result = await query(
    `SELECT
       user_id                                                           AS client_id,
       email                                                             AS client_email,
       NULLIF(BTRIM(CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,''))), '') AS client_name,
       NULLIF(BTRIM(COALESCE(company_name, '')), '')                     AS business_name
     FROM users
     ORDER BY company_name NULLS LAST, first_name NULLS LAST`,
    []
  );

  const clients = result.rows.map((r) => ({
    id: r.client_id,
    label: r.client_name || r.client_email || String(r.client_id),
    email: r.client_email,
  }));

  const businesses = [
    ...new Set(result.rows.map((r) => r.business_name).filter(Boolean)),
  ].sort();

  return { clients, businesses };
}
