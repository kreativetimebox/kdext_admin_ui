import { dexaiQuery } from "./dexaidb";

/**
 * Fetch all users from the MAIN_FINANCE_DB users table together with summary
 * counts of their document_processing_requests. Optional search filter over
 * email/first_name/last_name.
 */
export async function getDexaiUsers(filters = {}) {
  const { search = "" } = filters;

  const whereConditions = [];
  const params = [];
  let paramIndex = 1;

  if (search) {
    params.push(`%${search}%`);
    whereConditions.push(`(
      u.email ILIKE $${paramIndex}
      OR COALESCE(u.first_name, '') ILIKE $${paramIndex}
      OR COALESCE(u.last_name, '') ILIKE $${paramIndex}
    )`);
    paramIndex++;
  }

  const whereClause = whereConditions.length
    ? `WHERE ${whereConditions.join(" AND ")}`
    : "";

  const result = await dexaiQuery(
    `SELECT
       u.user_id,
       u.email,
       u.first_name,
       u.last_name,
       u.is_active,
       u.created_at,
       u.updated_at,
       u.last_login_at,
       COALESCE(stats.total_requests, 0)::int  AS total_requests,
       COALESCE(stats.completed_count, 0)::int AS completed_count,
       COALESCE(stats.failed_count, 0)::int    AS failed_count,
       stats.last_submitted_at                 AS last_submitted_at
     FROM users u
     LEFT JOIN (
       SELECT
         user_id,
         COUNT(*)                                                AS total_requests,
         COUNT(*) FILTER (WHERE status = 'COMPLETED')            AS completed_count,
         COUNT(*) FILTER (WHERE status = 'FAILED')               AS failed_count,
         MAX(submitted_at)                                       AS last_submitted_at
       FROM document_processing_requests
       WHERE is_deleted = false
       GROUP BY user_id
     ) stats ON stats.user_id = u.user_id
     ${whereClause}
     ORDER BY u.created_at DESC NULLS LAST`,
    params
  );

  return result.rows;
}

/**
 * Fetch a single user record by user_id.
 */
export async function getDexaiUserById(userId) {
  const result = await dexaiQuery(
    `SELECT
       u.user_id,
       u.email,
       u.first_name,
       u.last_name,
       u.is_active,
       u.created_at,
       u.updated_at,
       u.last_login_at
     FROM users u
     WHERE u.user_id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

/**
 * Fetch the list of document_processing_requests belonging to a single user.
 * Excludes the heavy JSON blobs (formatted_result / processing_result) so the
 * list page loads quickly. Supports optional search and document-type filters.
 */
export async function getDexaiUserResults(userId, filters = {}) {
  const { search = "", docType = "", status = "" } = filters;

  const whereConditions = [
    "d.user_id = $1",
    "d.is_deleted = false",
  ];
  const params = [userId];
  let paramIndex = 2;

  if (search) {
    params.push(`%${search}%`);
    whereConditions.push(`(
      d.request_id ILIKE $${paramIndex}
      OR COALESCE(d.original_filename, '') ILIKE $${paramIndex}
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

  if (status) {
    params.push(status);
    whereConditions.push(`d.status = $${paramIndex}`);
    paramIndex++;
  }

  const whereClause = `WHERE ${whereConditions.join(" AND ")}`;

  const result = await dexaiQuery(
    `SELECT
       d.request_id,
       d.transaction_id,
       d.original_filename,
       d.status,
       d.processing_duration_ms,
       d.submitted_at,
       d.created_at,
       d.updated_at,
       d.completed_at,
       COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) AS document_type
     FROM document_processing_requests d
     LEFT JOIN document_types dt ON dt.document_type_id = d.document_type_id
     ${whereClause}
     ORDER BY COALESCE(d.submitted_at, d.created_at) DESC NULLS LAST`,
    params
  );

  return result.rows;
}

/**
 * Fetch the full record for one document_processing_request, including JSON
 * payloads and document file path.
 */
export async function getDexaiResultByRequestId(requestId) {
  const result = await dexaiQuery(
    `SELECT
       d.request_id,
       d.user_id,
       d.transaction_id,
       d.document_path,
       d.original_filename,
       d.file_size_bytes,
       d.file_hash,
       d.status,
       d.error_message,
       d.error_code,
       d.processing_duration_ms,
       d.submitted_at,
       d.queued_at,
       d.started_at,
       d.completed_at,
       d.created_at,
       d.updated_at,
       d.formatted_result,
       d.processing_result,
       COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) AS document_type,
       u.email      AS user_email,
       u.first_name AS user_first_name,
       u.last_name  AS user_last_name
     FROM document_processing_requests d
     LEFT JOIN document_types dt ON dt.document_type_id = d.document_type_id
     LEFT JOIN users u           ON u.user_id           = d.user_id
     WHERE d.request_id = $1
       AND d.is_deleted = false`,
    [requestId]
  );
  return result.rows[0] || null;
}
