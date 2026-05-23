import { query } from "./db";

/**
 * Shared SELECT projection that maps document_processing_requests onto the
 * shape the rest of the app already speaks (id / ocr_document_type /
 * source_file / ocr_results). formatted_result is the editable, structured
 * extraction; processing_result is the raw worker payload.
 */
const DOC_SELECT = `
  SELECT
    d.request_id                                                                AS id,
    COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name)              AS ocr_document_type,
    d.document_path                                                             AS source_file,
    d.formatted_result                                                          AS ocr_results,
    d.processing_result                                                         AS processing_result,
    d.status,
    d.submitted_at,
    d.completed_at,
    d.transaction_id
  FROM document_processing_requests d
  LEFT JOIN document_types dt ON d.document_type_id = dt.document_type_id
`;

/**
 * Fetch the document list for the sidebar.
 */
export async function getDocumentList() {
  const result = await query(
    `${DOC_SELECT}
     WHERE d.is_deleted = false
       AND d.status = 'COMPLETED'
     ORDER BY d.submitted_at DESC`,
    []
  );
  return result.rows;
}

/**
 * Fetch a single document row by request_id.
 */
export async function getDocumentById(id) {
  const result = await query(
    `${DOC_SELECT}
     WHERE d.request_id = $1
       AND d.is_deleted = false`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Update the formatted_result column for a document.
 * @param {string} id - request_id
 * @param {object} uiResults - Parsed JSON object to store
 */
export async function updateUiResults(id, uiResults) {
  const result = await query(
    `UPDATE document_processing_requests
     SET formatted_result = $1::json,
         updated_at = CURRENT_TIMESTAMP
     WHERE request_id = $2
     RETURNING request_id AS id, formatted_result AS ocr_results`,
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

  const whereConditions = ["d.is_deleted = false", "d.status = 'COMPLETED'"];
  const params = [];
  let paramIndex = 1;

  if (search) {
    params.push(`%${search}%`);
    whereConditions.push(`(
      d.request_id ILIKE $${paramIndex}
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
       d.request_id                                                            AS id,
       COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name)          AS ocr_document_type,
       d.formatted_result                                                      AS ocr_results,
       d.submitted_at                                                          AS created_at
     FROM document_processing_requests d
     LEFT JOIN document_types dt ON d.document_type_id = dt.document_type_id
     ${whereClause}
     ORDER BY d.submitted_at DESC`,
    params
  );

  return result.rows;
}
