import { financeQuery } from "./financedb";

/**
 * Fetch summary rows for document_processing_requests with a non-empty
 * transaction_id. JOINed with document_types for a real type_name.
 */
export async function getTransactionRecords() {
  const result = await financeQuery(
    `SELECT
       d.result_id,
       d.request_id,
       d.transaction_id,
       d.document_path,
       d.original_filename,
       COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) AS document_type,
       d.status,
       d.submitted_at,
       d.completed_at
     FROM document_processing_requests d
     LEFT JOIN document_types dt ON dt.document_type_id = d.document_type_id
     WHERE d.transaction_id IS NOT NULL
       AND BTRIM(d.transaction_id) <> ''
       AND d.is_deleted = false
       AND d.result_id IS NOT NULL
     ORDER BY d.submitted_at DESC`,
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
       d.result_id,
       d.request_id,
       d.transaction_id,
       d.document_path,
       d.original_filename,
       COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) AS document_type,
       d.status,
       d.submitted_at,
       d.completed_at,
       d.processing_duration_ms,
       d.error_message,
       d.error_code,
       d.formatted_result,
       d.processing_result
     FROM document_processing_requests d
     LEFT JOIN document_types dt ON dt.document_type_id = d.document_type_id
     WHERE d.result_id = $1
       AND d.is_deleted = false`,
    [resultId]
  );
  return result.rows[0] || null;
}
