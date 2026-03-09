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

  // Check if ocr_ui_results contains any null values, empty strings, or empty arrays (only if showAll is false)
  if (!showAll) {
    whereConditions.push(`(
      ocr_ui_results IS NOT NULL 
      AND (
        ocr_ui_results::text LIKE '%null%'
        OR ocr_ui_results::text LIKE '%""%'
        OR ocr_ui_results::text ~ ':"\\s*"'
        OR ocr_ui_results::text LIKE '%[]%'
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
