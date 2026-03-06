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
