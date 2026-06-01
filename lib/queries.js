import { query } from "./db";
import { dexaiQuery } from "./dexaidb";

/**
 * Source of truth is now document_processing_requests (alias `d`). It carries
 * the original upload (document_path), the OCR payloads (formatted_result,
 * processing_result), the result_id, status, and timestamps. document_types
 * (alias `dt`) is joined for the human-readable type name when the request
 * row doesn't carry one.
 */
const DOC_FROM = `
  FROM document_processing_requests d
  LEFT JOIN document_types dt ON dt.document_type_id = d.document_type_id
`;

/**
 * The analyzer / missing-fields views surface documents from BOTH finance
 * databases in a single combined list:
 *   - `fin`  -> the local financedb pool (lib/db.js)
 *   - `main` -> MAIN_FINANCE_DB pool (lib/dexaidb.js)
 * Both share the same document_processing_requests schema, so the same SQL
 * runs against either pool.
 *
 * Because a result_id is only unique within its own database, every row that
 * leaves this module carries a *composite* id of the form `${source}~${result_id}`.
 * That composite id is what the sidebar/store/detail routes pass around, so a
 * detail / update / download request can be routed back to the right pool.
 */
const ID_SEP = "~";

const SOURCES = [
  { key: "fin", run: query },
  { key: "main", run: dexaiQuery },
];

function runnerFor(source) {
  return SOURCES.find((s) => s.key === source)?.run || null;
}

function makeCompositeId(source, resultId) {
  return `${source}${ID_SEP}${resultId}`;
}

/**
 * Split a composite id back into { source, resultId }. Bare ids (no separator)
 * are treated as belonging to the primary `fin` database for backward compat.
 */
function parseCompositeId(composite) {
  const str = String(composite ?? "");
  const idx = str.indexOf(ID_SEP);
  if (idx === -1) return { source: "fin", resultId: str };
  const source = str.slice(0, idx);
  const resultId = str.slice(idx + ID_SEP.length);
  return { source: runnerFor(source) ? source : "fin", resultId };
}

/**
 * Fetch the document list for the sidebar. Only the columns the sidebar
 * actually renders — the OCR JSON blobs are deliberately excluded so we
 * don't ship megabytes just to draw a list of IDs.
 */
export async function getDocumentList() {
  const sql = `SELECT
       d.result_id AS result_id,
       d.transaction_id AS transaction_id,
       COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) AS ocr_document_type
     ${DOC_FROM}
     WHERE d.is_deleted = false
       AND d.status = 'COMPLETED'
       AND d.result_id IS NOT NULL
     ORDER BY d.submitted_at DESC`;

  // Run against both finance databases in parallel; if one is unreachable we
  // still return whatever the other returned rather than failing the page.
  const settled = await Promise.allSettled(SOURCES.map(({ run }) => run(sql, [])));

  const documents = [];
  settled.forEach((res, i) => {
    const { key } = SOURCES[i];
    if (res.status === "fulfilled") {
      for (const r of res.value.rows) {
        documents.push({
          id: makeCompositeId(key, r.result_id),
          result_id: r.result_id,
          transaction_id: r.transaction_id,
          source: key,
          ocr_document_type: r.ocr_document_type,
        });
      }
    } else {
      console.error(`getDocumentList: '${key}' source failed:`, res.reason?.message);
    }
  });

  return documents;
}

/**
 * Fetch a single document row by result_id.
 */
export async function getDocumentById(id) {
  const { source, resultId } = parseCompositeId(id);
  const run = runnerFor(source);
  if (!run) return null;

  const result = await run(
    `SELECT
       d.result_id                                                    AS id,
       d.request_id                                                   AS request_id,
       d.transaction_id                                               AS transaction_id,
       COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) AS ocr_document_type,
       d.document_path                                                AS source_file,
       d.formatted_result                                             AS ocr_results,
       d.processing_result                                            AS processing_result,
       d.status,
       d.submitted_at,
       d.completed_at
     ${DOC_FROM}
     WHERE d.result_id = $1
       AND d.is_deleted = false`,
    [resultId]
  );

  const row = result.rows[0];
  if (!row) return null;
  // Re-attach the composite id + source so the frontend keeps routing back to
  // the same database for downloads / saves.
  return { ...row, id: makeCompositeId(source, row.id), result_id: row.id, source };
}

/**
 * Update the formatted_result column for a result row.
 * @param {string} id - result_id
 * @param {object} uiResults - Parsed JSON object to store
 */
export async function updateUiResults(id, uiResults) {
  const { source, resultId } = parseCompositeId(id);
  const run = runnerFor(source);
  if (!run) return null;

  const result = await run(
    `UPDATE document_processing_requests
     SET formatted_result = $1::json,
         updated_at = CURRENT_TIMESTAMP
     WHERE result_id = $2
     RETURNING result_id AS id, formatted_result AS ocr_results`,
    [JSON.stringify(uiResults), resultId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return { ...row, id: makeCompositeId(source, row.id) };
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
 * @param {object} filters - { search, docType, showAll }
 */
export async function getDocumentsWithMissingFields(filters = {}) {
  const { search = "", docType = "", showAll = false } = filters;

  const whereConditions = [
    "d.is_deleted = false",
    "d.status = 'COMPLETED'",
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
      created_at,
      submitted_at,
      updated_at,
      missing_fields,
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
        ${MISSING_FIELDS_EXPR}                                         AS missing_fields
      ${DOC_FROM}
      ${whereClause}
    ) t
    ${havingClause}
    ORDER BY created_at DESC NULLS LAST
  `;

  // Run the (expensive) JSON scan against both finance databases in parallel
  // and merge into a single combined list. A failure in one source is logged
  // but doesn't take down the whole page.
  const settled = await Promise.allSettled(
    SOURCES.map(({ run }) => run(sql, params))
  );

  const rows = [];
  settled.forEach((res, i) => {
    const { key } = SOURCES[i];
    if (res.status === "fulfilled") {
      for (const r of res.value.rows) {
        rows.push({
          ...r,
          id: makeCompositeId(key, r.result_id),
          source: key,
        });
      }
    } else {
      console.error(
        `getDocumentsWithMissingFields: '${key}' source failed:`,
        res.reason?.message
      );
    }
  });

  // Combined set is no longer globally sorted across sources — re-sort by date.
  rows.sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });

  return rows;
}
