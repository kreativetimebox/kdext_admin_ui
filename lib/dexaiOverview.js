import { dexaiQuery } from "./dexaidb";

/**
 * Aggregate counts powering the home dashboard. Single query so the home
 * page only fires one request.
 */
export async function getDexaiOverview() {
  const result = await dexaiQuery(
    `SELECT
       (SELECT COUNT(*) FROM users)::int                                                   AS users_count,
       (SELECT COUNT(*) FROM users WHERE is_active)::int                                   AS active_users_count,
       (SELECT COUNT(*) FROM document_processing_requests WHERE is_deleted = false)::int   AS total_requests,
       (SELECT COUNT(*) FROM document_processing_requests
          WHERE is_deleted = false AND status = 'COMPLETED')::int                          AS completed_requests,
       (SELECT COUNT(*) FROM document_processing_requests
          WHERE is_deleted = false AND status = 'FAILED')::int                             AS failed_requests,
       (SELECT COUNT(*) FROM document_processing_requests
          WHERE is_deleted = false AND status IN ('PENDING','PROCESSING','QUEUED'))::int   AS pending_requests,
       (SELECT COUNT(DISTINCT document_type_id) FROM document_processing_requests
          WHERE is_deleted = false)::int                                                   AS distinct_doc_types`,
    []
  );
  return result.rows[0] || null;
}

/**
 * Recent activity rows for the dashboard preview.
 */
export async function getRecentDexaiRequests(limit = 6) {
  const result = await dexaiQuery(
    `SELECT
       d.request_id,
       d.user_id,
       d.status,
       d.submitted_at,
       d.processing_duration_ms,
       COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) AS document_type,
       u.email      AS user_email,
       u.first_name AS user_first_name,
       u.last_name  AS user_last_name
     FROM document_processing_requests d
     LEFT JOIN document_types dt ON dt.document_type_id = d.document_type_id
     LEFT JOIN users u           ON u.user_id           = d.user_id
     WHERE d.is_deleted = false
     ORDER BY d.submitted_at DESC NULLS LAST
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}
