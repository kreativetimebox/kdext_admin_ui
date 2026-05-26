import { query } from "./db";

/**
 * Shared SELECT projection: processing_document_results is the source of
 * truth for results (one row per processing attempt), keyed by result_id
 * (e.g. PDR-AAA001). document_processing_requests holds the original
 * upload, which is where document_path (the image/PDF) lives.
 */
const DOC_SELECT = `
  SELECT
    p.result_id                                                                 AS id,
    p.request_id                                                                AS request_id,
    p.transaction_id                                                            AS transaction_id,
    COALESCE(
      NULLIF(BTRIM(p.ocr_document_type), ''),
      NULLIF(BTRIM(d.ocr_document_type), ''),
      dt.type_name
    )                                                                           AS ocr_document_type,
    d.document_path                                                             AS source_file,
    p.formatted_result                                                          AS ocr_results,
    p.processing_result                                                         AS processing_result,
    p.status,
    p.created_at                                                                AS submitted_at,
    d.completed_at
  FROM processing_document_results p
  LEFT JOIN document_processing_requests d ON p.request_id = d.request_id
  LEFT JOIN document_types dt ON COALESCE(p.document_type_id, d.document_type_id) = dt.document_type_id
`;

/**
 * Fetch the document list for the sidebar. Only the columns the sidebar
 * actually renders — the full formatted_result / processing_result JSON
 * blobs are deliberately excluded so we don't ship megabytes of OCR data
 * just to draw a list of IDs.
 */
export async function getDocumentList() {
  const result = await query(
    `SELECT
       p.result_id AS id,
       COALESCE(
         NULLIF(BTRIM(p.ocr_document_type), ''),
         NULLIF(BTRIM(d.ocr_document_type), ''),
         dt.type_name
       ) AS ocr_document_type
     FROM processing_document_results p
     LEFT JOIN document_processing_requests d ON p.request_id = d.request_id
     LEFT JOIN document_types dt ON COALESCE(p.document_type_id, d.document_type_id) = dt.document_type_id
     WHERE p.is_deleted = false
       AND p.status = 'COMPLETED'
     ORDER BY p.created_at DESC`,
    []
  );
  return result.rows;
}

/**
 * Fetch a single document row by result_id.
 */
export async function getDocumentById(id) {
  const result = await query(
    `${DOC_SELECT}
     WHERE p.result_id = $1
       AND p.is_deleted = false`,
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
    `UPDATE processing_document_results
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

  const whereConditions = ["p.is_deleted = false", "p.status = 'COMPLETED'"];
  const params = [];
  let paramIndex = 1;

  if (search) {
    params.push(`%${search}%`);
    whereConditions.push(`(
      p.result_id ILIKE $${paramIndex}
      OR p.request_id ILIKE $${paramIndex}
      OR COALESCE(p.ocr_document_type, '') ILIKE $${paramIndex}
      OR COALESCE(d.ocr_document_type, '') ILIKE $${paramIndex}
      OR COALESCE(dt.type_name, '') ILIKE $${paramIndex}
      OR COALESCE(p.transaction_id, '') ILIKE $${paramIndex}
    )`);
    paramIndex++;
  }

  if (docType) {
    params.push(docType);
    whereConditions.push(
      `COALESCE(NULLIF(BTRIM(p.ocr_document_type), ''), NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) = $${paramIndex}`
    );
    paramIndex++;
  }

  if (!showAll) {
    whereConditions.push(`(
      p.formatted_result IS NULL
      OR (
        (
          (
            COALESCE(NULLIF(BTRIM(p.ocr_document_type), ''), NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) ILIKE '%bank statement%'
            OR regexp_replace(lower(COALESCE(p.ocr_document_type, d.ocr_document_type, dt.type_name, '')), '[^a-z]', '', 'g') LIKE '%bankstatement%'
          )
          AND (
            COALESCE(NULLIF(BTRIM(COALESCE(p.formatted_result::jsonb->>'bankName', p.formatted_result::jsonb->>'bank_name')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(p.formatted_result::jsonb->>'accountHolderName', p.formatted_result::jsonb->>'account_holder_name')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(p.formatted_result::jsonb->>'openingDate', p.formatted_result::jsonb->>'opening_date')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(p.formatted_result::jsonb->>'closingDate', p.formatted_result::jsonb->>'closing_date')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(p.formatted_result::jsonb->>'openingBalance', p.formatted_result::jsonb->>'opening_balance')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(p.formatted_result::jsonb->>'closingBalance', p.formatted_result::jsonb->>'closing_balance')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(p.formatted_result::jsonb->>'currencyCode', p.formatted_result::jsonb->>'currency')), ''), 'null') = 'null'
            OR COALESCE(jsonb_typeof(COALESCE(p.formatted_result::jsonb->'tableItems', p.formatted_result::jsonb->'table_items', p.formatted_result::jsonb->'items')), '') <> 'array'
            OR jsonb_array_length(COALESCE(p.formatted_result::jsonb->'tableItems', p.formatted_result::jsonb->'table_items', p.formatted_result::jsonb->'items', '[]'::jsonb)) = 0
          )
        )
        OR
        (
          COALESCE(NULLIF(BTRIM(p.ocr_document_type), ''), NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) ILIKE '%receipt%'
          AND (
            COALESCE(NULLIF(BTRIM(COALESCE(p.formatted_result::jsonb->>'document_id', p.formatted_result::jsonb->>'documentId')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(p.formatted_result::jsonb->>'supplier_name', p.formatted_result::jsonb->>'supplierName')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(p.formatted_result::jsonb->>'receipt_date', p.formatted_result::jsonb->>'date')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(p.formatted_result::jsonb->>'currency', p.formatted_result::jsonb->>'currencyCode')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(p.formatted_result::jsonb->>'total_amount', p.formatted_result::jsonb->>'totalAmount')), ''), 'null') = 'null'
            OR COALESCE(jsonb_typeof(COALESCE(p.formatted_result::jsonb->'items', p.formatted_result::jsonb->'tableItems')), '') <> 'array'
            OR jsonb_array_length(COALESCE(p.formatted_result::jsonb->'items', p.formatted_result::jsonb->'tableItems', '[]'::jsonb)) = 0
          )
        )
        OR (
          COALESCE(NULLIF(BTRIM(p.ocr_document_type), ''), NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) ILIKE '%invoice%'
          AND (
            COALESCE(NULLIF(BTRIM(COALESCE(p.formatted_result::jsonb->>'documentId', p.formatted_result::jsonb->>'document_id', p.formatted_result::jsonb->>'invoice_number')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(p.formatted_result::jsonb->>'supplierName', p.formatted_result::jsonb->>'supplier_name')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(p.formatted_result::jsonb->>'customerName', p.formatted_result::jsonb->>'customer_name')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(p.formatted_result::jsonb->>'date', p.formatted_result::jsonb->>'invoice_date')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(p.formatted_result::jsonb->>'currencyCode', p.formatted_result::jsonb->>'currency')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(p.formatted_result::jsonb->>'totalAmount', p.formatted_result::jsonb->>'total_amount')), ''), 'null') = 'null'
            OR COALESCE(jsonb_typeof(COALESCE(p.formatted_result::jsonb->'tableItems', p.formatted_result::jsonb->'items')), '') <> 'array'
            OR jsonb_array_length(COALESCE(p.formatted_result::jsonb->'tableItems', p.formatted_result::jsonb->'items', '[]'::jsonb)) = 0
          )
        )
      )
    )`);
  }

  const whereClause =
    whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

  const result = await query(
    `SELECT
       p.result_id                                                                AS id,
       p.request_id                                                               AS request_id,
       COALESCE(NULLIF(BTRIM(p.ocr_document_type), ''), NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) AS ocr_document_type,
       p.formatted_result                                                         AS ocr_results,
       COALESCE(p.created_at, d.completed_at)                                     AS created_at
     FROM processing_document_results p
     LEFT JOIN document_processing_requests d ON p.request_id = d.request_id
     LEFT JOIN document_types dt ON COALESCE(p.document_type_id, d.document_type_id) = dt.document_type_id
     ${whereClause}
     ORDER BY COALESCE(p.created_at, d.completed_at) DESC NULLS LAST`,
    params
  );

  return result.rows;
}
