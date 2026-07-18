import { financeQuery } from "./financedb";

/**
 * Fetch summary rows for document_processing_requests with a non-empty
 * transaction_id. JOINed with document_types for a real type_name.
 *
 * @param {object} filters - { search, docType, page, pageSize }
 * @returns {Promise<{rows: object[], total: number}>}
 */
export async function getTransactionRecords(filters = {}) {
  const { search = "", docType = "", page = 1, pageSize = 50 } = filters;

  const whereConditions = [
    "d.transaction_id IS NOT NULL",
    "BTRIM(d.transaction_id) <> ''",
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
      OR d.transaction_id ILIKE $${paramIndex}
      OR d.original_filename ILIKE $${paramIndex}
      OR COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) ILIKE $${paramIndex}
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

  const safePageSize = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
  const safePage = Math.max(Number(page) || 1, 1);
  params.push(safePageSize, (safePage - 1) * safePageSize);

  const result = await financeQuery(
    `SELECT
       COUNT(*) OVER() AS total_count,
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
     WHERE ${whereConditions.join(" AND ")}
     ORDER BY d.submitted_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    params
  );
  const total = result.rows[0]?.total_count ? Number(result.rows[0].total_count) : 0;
  const rows = result.rows.map(({ total_count, ...r }) => r);
  return { rows, total };
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
