import { query } from "./db";

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
 * Fetch the document list for the sidebar. Only the columns the sidebar
 * actually renders — the OCR JSON blobs are deliberately excluded so we
 * don't ship megabytes just to draw a list of IDs.
 */
export async function getDocumentList() {
  const result = await query(
    `SELECT
       d.result_id AS id,
       COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) AS ocr_document_type
     ${DOC_FROM}
     WHERE d.is_deleted = false
       AND d.status = 'COMPLETED'
       AND d.result_id IS NOT NULL
     ORDER BY d.submitted_at DESC`,
    []
  );
  return result.rows;
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
       d.processing_result                                            AS processing_result,
       d.status,
       d.submitted_at,
       d.completed_at
     ${DOC_FROM}
     WHERE d.result_id = $1
       AND d.is_deleted = false`,
    [id]
  );
  return result.rows[0] || null;
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
 * Fetch documents whose formatted_result has at least one null/missing
 * mandatory field, with optional search and document-type filters.
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

  if (!showAll) {
    whereConditions.push(`(
      d.formatted_result IS NULL
      OR (
        (
          (
            COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) ILIKE '%bank statement%'
            OR regexp_replace(lower(COALESCE(d.ocr_document_type, dt.type_name, '')), '[^a-z]', '', 'g') LIKE '%bankstatement%'
          )
          AND (
            COALESCE(NULLIF(BTRIM(COALESCE(d.formatted_result::jsonb->>'bankName', d.formatted_result::jsonb->>'bank_name')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(d.formatted_result::jsonb->>'accountHolderName', d.formatted_result::jsonb->>'account_holder_name')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(d.formatted_result::jsonb->>'openingDate', d.formatted_result::jsonb->>'opening_date')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(d.formatted_result::jsonb->>'closingDate', d.formatted_result::jsonb->>'closing_date')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(d.formatted_result::jsonb->>'openingBalance', d.formatted_result::jsonb->>'opening_balance')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(d.formatted_result::jsonb->>'closingBalance', d.formatted_result::jsonb->>'closing_balance')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(d.formatted_result::jsonb->>'currencyCode', d.formatted_result::jsonb->>'currency')), ''), 'null') = 'null'
            OR COALESCE(jsonb_typeof(COALESCE(d.formatted_result::jsonb->'tableItems', d.formatted_result::jsonb->'table_items', d.formatted_result::jsonb->'items')), '') <> 'array'
            OR jsonb_array_length(COALESCE(d.formatted_result::jsonb->'tableItems', d.formatted_result::jsonb->'table_items', d.formatted_result::jsonb->'items', '[]'::jsonb)) = 0
          )
        )
        OR
        (
          COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) ILIKE '%receipt%'
          AND (
            COALESCE(NULLIF(BTRIM(COALESCE(d.formatted_result::jsonb->>'document_id', d.formatted_result::jsonb->>'documentId')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(d.formatted_result::jsonb->>'supplier_name', d.formatted_result::jsonb->>'supplierName')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(d.formatted_result::jsonb->>'receipt_date', d.formatted_result::jsonb->>'date')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(d.formatted_result::jsonb->>'currency', d.formatted_result::jsonb->>'currencyCode')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(d.formatted_result::jsonb->>'total_amount', d.formatted_result::jsonb->>'totalAmount')), ''), 'null') = 'null'
            OR COALESCE(jsonb_typeof(COALESCE(d.formatted_result::jsonb->'items', d.formatted_result::jsonb->'tableItems')), '') <> 'array'
            OR jsonb_array_length(COALESCE(d.formatted_result::jsonb->'items', d.formatted_result::jsonb->'tableItems', '[]'::jsonb)) = 0
          )
        )
        OR (
          COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) ILIKE '%invoice%'
          AND (
            COALESCE(NULLIF(BTRIM(COALESCE(d.formatted_result::jsonb->>'documentId', d.formatted_result::jsonb->>'document_id', d.formatted_result::jsonb->>'invoice_number')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(d.formatted_result::jsonb->>'supplierName', d.formatted_result::jsonb->>'supplier_name')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(d.formatted_result::jsonb->>'customerName', d.formatted_result::jsonb->>'customer_name')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(d.formatted_result::jsonb->>'date', d.formatted_result::jsonb->>'invoice_date')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(d.formatted_result::jsonb->>'currencyCode', d.formatted_result::jsonb->>'currency')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(d.formatted_result::jsonb->>'totalAmount', d.formatted_result::jsonb->>'total_amount')), ''), 'null') = 'null'
            OR COALESCE(jsonb_typeof(COALESCE(d.formatted_result::jsonb->'tableItems', d.formatted_result::jsonb->'items')), '') <> 'array'
            OR jsonb_array_length(COALESCE(d.formatted_result::jsonb->'tableItems', d.formatted_result::jsonb->'items', '[]'::jsonb)) = 0
          )
        )
      )
    )`);
  }

  const whereClause =
    whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  const result = await query(
    `SELECT
       d.result_id                                                    AS id,
       d.request_id                                                   AS request_id,
       COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) AS ocr_document_type,
       d.formatted_result                                             AS ocr_results,
       COALESCE(d.submitted_at, d.created_at, d.completed_at)         AS created_at
     ${DOC_FROM}
     ${whereClause}
     ORDER BY COALESCE(d.submitted_at, d.created_at, d.completed_at) DESC NULLS LAST`,
    params
  );

  return result.rows;
}
