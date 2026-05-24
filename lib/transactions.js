import { financeQuery } from "./financedb";

/**
 * Fetch summary rows for processing_document_results with a non-empty
 * transaction_id. JOINed with document_processing_requests for the source
 * document_path and document_types for a real type_name.
 */
export async function getTransactionRecords() {
  const result = await financeQuery(
    `SELECT
       p.result_id,
       p.request_id,
       p.transaction_id,
       d.document_path,
       d.original_filename,
       COALESCE(
         NULLIF(BTRIM(p.ocr_document_type), ''),
         NULLIF(BTRIM(d.ocr_document_type), ''),
         dt.type_name
       )                                                                          AS document_type,
       p.status,
       p.created_at                                                               AS submitted_at,
       d.completed_at
     FROM processing_document_results p
     LEFT JOIN document_processing_requests d ON p.request_id = d.request_id
     LEFT JOIN document_types dt ON COALESCE(p.document_type_id, d.document_type_id) = dt.document_type_id
     WHERE p.transaction_id IS NOT NULL
       AND BTRIM(p.transaction_id) <> ''
       AND p.is_deleted = false
     ORDER BY p.created_at DESC`,
    []
  );
  return result.rows;
}

/**
 * Fetch the full record for a single result row (used by the detail page).
 */
export async function getTransactionByResultId(resultId) {
  const result = await financeQuery(
    `SELECT
       p.result_id,
       p.request_id,
       p.transaction_id,
       d.document_path,
       d.original_filename,
       COALESCE(
         NULLIF(BTRIM(p.ocr_document_type), ''),
         NULLIF(BTRIM(d.ocr_document_type), ''),
         dt.type_name
       )                                                                          AS document_type,
       p.status,
       p.created_at                                                               AS submitted_at,
       d.completed_at,
       p.processing_duration_ms,
       p.error_message,
       p.error_code,
       p.formatted_result,
       p.processing_result
     FROM processing_document_results p
     LEFT JOIN document_processing_requests d ON p.request_id = d.request_id
     LEFT JOIN document_types dt ON COALESCE(p.document_type_id, d.document_type_id) = dt.document_type_id
     WHERE p.result_id = $1
       AND p.is_deleted = false`,
    [resultId]
  );
  return result.rows[0] || null;
}
