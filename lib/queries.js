import { query } from "./db";

/**
 * Fetch the document list for the sidebar.
 * SELECT id, ocr_document_type FROM website_ocr_results ORDER BY id DESC LIMIT 100
 */
export async function getDocumentList() {
  const result = await query(
    `SELECT id, ocr_document_type
     FROM website_ocr_results WHERE status = 'COMPLETED'
     ORDER BY id DESC`,
    []
  );
  return result.rows;
}

/**
 * Fetch a single document row by ID.
 */
export async function getDocumentById(id) {
  const result = await query(
    `SELECT
       id,
       ocr_document_type,
       source_file,
       textract_results,
       ocr_results,
       textract_raw_results,
       ocr_ui_results
     FROM website_ocr_results
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Update the ocr_ui_results column for a document.
 * @param {number|string} id
 * @param {object} uiResults - Parsed JSON object to store
 */
export async function updateUiResults(id, uiResults) {
  const result = await query(
    `UPDATE website_ocr_results
     SET ocr_ui_results = $1
     WHERE id = $2
     RETURNING id, ocr_ui_results`,
    [JSON.stringify(uiResults), id]
  );
  return result.rows[0] || null;
}

/**
 * Fetch documents where ocr_ui_results has at least one null/missing mandatory field.
 * @param {object} filters - { search, docType, environment, showAll }
 */
export async function getDocumentsWithMissingFields(filters = {}) {
  const { search = "", docType = "", environment = "", showAll = false } = filters;
  
  let whereConditions = ["status = 'COMPLETED'"];
  let params = [];
  let paramIndex = 1;

  // Filter by search (id or any text field)
  if (search) {
    params.push(`%${search}%`);
    whereConditions.push(`(
      CAST(id AS TEXT) ILIKE $${paramIndex} 
      OR ocr_document_type ILIKE $${paramIndex}
      OR environment ILIKE $${paramIndex}
    )`);
    paramIndex++;
  }

  // Filter by document type
  if (docType) {
    params.push(docType);
    whereConditions.push(`ocr_document_type = $${paramIndex}`);
    paramIndex++;
  }

  // Filter by environment
  if (environment) {
    params.push(environment);
    whereConditions.push(`environment = $${paramIndex}`);
    paramIndex++;
  }

  // Check only mandatory fields (only if showAll is false)
  if (!showAll) {
    whereConditions.push(`(
      ocr_ui_results IS NULL
      OR (
        (
          (
            ocr_document_type ILIKE '%bank statement%'
            OR regexp_replace(lower(ocr_document_type), '[^a-z]', '', 'g') LIKE '%bankstatement%'
          )
          AND (
            COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'bankName', ocr_ui_results::jsonb->>'bank_name')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'accountHolderName', ocr_ui_results::jsonb->>'account_holder_name')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'openingDate', ocr_ui_results::jsonb->>'opening_date')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'closingDate', ocr_ui_results::jsonb->>'closing_date')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'openingBalance', ocr_ui_results::jsonb->>'opening_balance')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'closingBalance', ocr_ui_results::jsonb->>'closing_balance')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'currencyCode', ocr_ui_results::jsonb->>'currency')), ''), 'null') = 'null'
            OR COALESCE(jsonb_typeof(COALESCE(ocr_ui_results::jsonb->'tableItems', ocr_ui_results::jsonb->'table_items', ocr_ui_results::jsonb->'items')), '') <> 'array'
            OR jsonb_array_length(COALESCE(ocr_ui_results::jsonb->'tableItems', ocr_ui_results::jsonb->'table_items', ocr_ui_results::jsonb->'items', '[]'::jsonb)) = 0
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements(COALESCE(ocr_ui_results::jsonb->'tableItems', ocr_ui_results::jsonb->'table_items', ocr_ui_results::jsonb->'items', '[]'::jsonb)) AS item(elem)
              WHERE
                COALESCE(jsonb_typeof(elem), '') <> 'object'
                OR COALESCE(NULLIF(BTRIM(COALESCE(elem->>'description', elem->>'Payment type and details', elem->>'payment_type_and_details', elem->>'details')), ''), 'null') = 'null'
                OR COALESCE(NULLIF(BTRIM(COALESCE(elem->>'date', elem->>'Date')), ''), 'null') = 'null'
                OR COALESCE(NULLIF(BTRIM(COALESCE(elem->>'debitAmount', elem->>'debit_amount', elem->>'Paid out', elem->>'paid_out')), ''), 'null') = 'null'
                OR COALESCE(NULLIF(BTRIM(COALESCE(elem->>'creditAmount', elem->>'credit_amount', elem->>'Paid in', elem->>'paid_in')), ''), 'null') = 'null'
                OR COALESCE(NULLIF(BTRIM(COALESCE(elem->>'balanceAmount', elem->>'balance_amount', elem->>'Balance', elem->>'balance')), ''), 'null') = 'null'
            )
          )
        )
        OR
        (
          ocr_document_type ILIKE '%receipt%'
          AND (
            COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'document_id', ocr_ui_results::jsonb->>'documentId')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'supplier_name', ocr_ui_results::jsonb->>'supplierName')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'receipt_date', ocr_ui_results::jsonb->>'date')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'currency', ocr_ui_results::jsonb->>'currencyCode')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'total_amount', ocr_ui_results::jsonb->>'totalAmount')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'net_amount', ocr_ui_results::jsonb->>'netAmount')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'vat_amount', ocr_ui_results::jsonb->>'taxAmount')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'discount', ocr_ui_results::jsonb->>'discountAmount')), ''), 'null') = 'null'
            OR COALESCE(jsonb_typeof(COALESCE(ocr_ui_results::jsonb->'items', ocr_ui_results::jsonb->'tableItems')), '') <> 'array'
            OR jsonb_array_length(COALESCE(ocr_ui_results::jsonb->'items', ocr_ui_results::jsonb->'tableItems', '[]'::jsonb)) = 0
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements(COALESCE(ocr_ui_results::jsonb->'items', ocr_ui_results::jsonb->'tableItems', '[]'::jsonb)) AS item(elem)
              WHERE
                COALESCE(jsonb_typeof(elem), '') <> 'object'
                OR COALESCE(NULLIF(BTRIM(COALESCE(elem->>'item_name', elem->>'description')), ''), 'null') = 'null'
                OR COALESCE(NULLIF(BTRIM(elem->>'quantity'), ''), 'null') = 'null'
                OR COALESCE(NULLIF(BTRIM(COALESCE(elem->>'price', elem->>'unitPrice')), ''), 'null') = 'null'
            )
          )
        )
        OR (
          ocr_document_type ILIKE '%invoice%'
          AND (
            COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'documentId', ocr_ui_results::jsonb->>'document_id', ocr_ui_results::jsonb->>'invoice_number')), ''), 'null') = 'null'
            OR (
              (
                ocr_document_type ILIKE '%purchase%'
                OR ocr_document_type NOT ILIKE '%sale%'
              )
              AND COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'supplierName', ocr_ui_results::jsonb->>'supplier_name')), ''), 'null') = 'null'
            )
            OR COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'customerName', ocr_ui_results::jsonb->>'customer_name')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'date', ocr_ui_results::jsonb->>'invoice_date')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'dueDate', ocr_ui_results::jsonb->>'due_date')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'currencyCode', ocr_ui_results::jsonb->>'currency')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'totalAmount', ocr_ui_results::jsonb->>'total_amount', ocr_ui_results::jsonb->'amounts'->>'Grand Total', ocr_ui_results::jsonb->'amounts'->>'total', ocr_ui_results::jsonb->'amounts'->>'grand_total')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'netAmount', ocr_ui_results::jsonb->>'net_amount', ocr_ui_results::jsonb->>'subtotal', ocr_ui_results::jsonb->'amounts'->>'Subtotal', ocr_ui_results::jsonb->'amounts'->>'subtotal')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'taxAmount', ocr_ui_results::jsonb->>'vat_amount', ocr_ui_results::jsonb->'amounts'->>'VAT', ocr_ui_results::jsonb->'amounts'->>'vat')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'discountAmount', ocr_ui_results::jsonb->>'discount')), ''), 'null') = 'null'
            OR COALESCE(jsonb_typeof(COALESCE(ocr_ui_results::jsonb->'tableItems', ocr_ui_results::jsonb->'items')), '') <> 'array'
            OR jsonb_array_length(COALESCE(ocr_ui_results::jsonb->'tableItems', ocr_ui_results::jsonb->'items', '[]'::jsonb)) = 0
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements(COALESCE(ocr_ui_results::jsonb->'tableItems', ocr_ui_results::jsonb->'items', '[]'::jsonb)) AS item(elem)
              WHERE
                COALESCE(jsonb_typeof(elem), '') <> 'object'
                OR COALESCE(NULLIF(BTRIM(COALESCE(elem->>'description', elem->>'item_name', elem->>'Product', elem->>'product')), ''), 'null') = 'null'
                OR COALESCE(NULLIF(BTRIM(COALESCE(elem->>'quantity', elem->>'Qty', elem->>'qty')), ''), 'null') = 'null'
                OR COALESCE(NULLIF(BTRIM(COALESCE(elem->>'unitPrice', elem->>'price', elem->>'Price')), ''), 'null') = 'null'
                OR COALESCE(NULLIF(BTRIM(COALESCE(elem->>'totalAmount', elem->>'total_amount', elem->>'Subtotal', elem->>'subtotal')), ''), 'null') = 'null'
                OR COALESCE(NULLIF(BTRIM(COALESCE(elem->>'netAmount', elem->>'net_amount', elem->>'Subtotal', elem->>'subtotal')), ''), 'null') = 'null'
                OR COALESCE(NULLIF(BTRIM(COALESCE(elem->>'taxAmount', elem->>'tax_amount', elem->>'vat_amount', elem->>'VAT', elem->>'vat')), ''), 'null') = 'null'
                OR COALESCE(NULLIF(BTRIM(COALESCE(elem->>'discountAmount', elem->>'discount')), ''), 'null') = 'null'
            )
          )
        )
        OR (
          ocr_document_type NOT ILIKE '%receipt%'
          AND ocr_document_type NOT ILIKE '%invoice%'
          AND ocr_document_type NOT ILIKE '%bank statement%'
          AND regexp_replace(lower(ocr_document_type), '[^a-z]', '', 'g') NOT LIKE '%bankstatement%'
          AND (
            COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'documentId', ocr_ui_results::jsonb->>'document_id')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'date', ocr_ui_results::jsonb->>'receipt_date')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(ocr_ui_results::jsonb->>'dueDate'), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'currencyCode', ocr_ui_results::jsonb->>'currency')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'totalAmount', ocr_ui_results::jsonb->>'total_amount')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'netAmount', ocr_ui_results::jsonb->>'net_amount')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'taxAmount', ocr_ui_results::jsonb->>'vat_amount')), ''), 'null') = 'null'
            OR COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'discountAmount', ocr_ui_results::jsonb->>'discount')), ''), 'null') = 'null'
            OR (
              ocr_document_type ILIKE '%sale%'
              AND COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'customerName', ocr_ui_results::jsonb->>'customer_name')), ''), 'null') = 'null'
            )
            OR (
              ocr_document_type ILIKE '%purchase%'
              AND COALESCE(NULLIF(BTRIM(COALESCE(ocr_ui_results::jsonb->>'supplierName', ocr_ui_results::jsonb->>'supplier_name')), ''), 'null') = 'null'
            )
            OR COALESCE(jsonb_typeof(COALESCE(ocr_ui_results::jsonb->'tableItems', ocr_ui_results::jsonb->'items')), '') <> 'array'
            OR jsonb_array_length(COALESCE(ocr_ui_results::jsonb->'tableItems', ocr_ui_results::jsonb->'items', '[]'::jsonb)) = 0
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements(COALESCE(ocr_ui_results::jsonb->'tableItems', ocr_ui_results::jsonb->'items', '[]'::jsonb)) AS item(elem)
              WHERE
                COALESCE(jsonb_typeof(elem), '') <> 'object'
                OR COALESCE(NULLIF(BTRIM(COALESCE(elem->>'description', elem->>'item_name')), ''), 'null') = 'null'
                OR COALESCE(NULLIF(BTRIM(elem->>'quantity'), ''), 'null') = 'null'
                OR COALESCE(NULLIF(BTRIM(COALESCE(elem->>'unitPrice', elem->>'price')), ''), 'null') = 'null'
                OR COALESCE(NULLIF(BTRIM(elem->>'totalAmount'), ''), 'null') = 'null'
                OR COALESCE(NULLIF(BTRIM(elem->>'netAmount'), ''), 'null') = 'null'
                OR COALESCE(NULLIF(BTRIM(elem->>'taxAmount'), ''), 'null') = 'null'
                OR COALESCE(NULLIF(BTRIM(elem->>'discountAmount'), ''), 'null') = 'null'
            )
          )
        )
      )
    )`);
  }

  const whereClause = whereConditions.length > 0 
    ? `WHERE ${whereConditions.join(" AND ")}`
    : "";

  const result = await query(
    `SELECT 
       id,
       ocr_document_type,
       environment,
       ocr_ui_results,
       created_at
     FROM website_ocr_results
     ${whereClause}
     ORDER BY id DESC`,
    params
  );

  return result.rows;
}
