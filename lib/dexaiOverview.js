import { dexaiQuery } from "./dexaidb";

/**
 * Aggregate counts powering the home dashboard. Single query so the home
 * page only fires one request.
 *
 * @param {object} [filters] - { clientId } - when set (CLIENT_ADMIN/CLIENT_USER),
 * every count is scoped down to that single users.user_id.
 */
export async function getDexaiOverview(filters = {}) {
  const { clientId = "" } = filters;
  const userIdFilter = clientId ? "user_id = $1" : "TRUE";
  // Separate filter fragment for the clients_count subquery below — that one
  // queries internal_users (column client_id), not users (column user_id).
  const internalUserClientFilter = clientId ? "iu.client_id = $1" : "TRUE";
  const params = clientId ? [clientId] : [];

  const result = await dexaiQuery(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE ${userIdFilter})::int                                       AS users_count,
       (SELECT COUNT(*) FROM users WHERE ${userIdFilter} AND is_active)::int                          AS active_users_count,
       (SELECT COUNT(DISTINCT company_name) FROM users
          WHERE company_name IS NOT NULL AND BTRIM(company_name) <> '' AND ${userIdFilter})::int     AS businesses_count,
       -- "Clients" here means portal clients specifically — one CLIENT_ADMIN
       -- login per client — not raw users-table rows (which would include
       -- not-yet-provisioned clients) and not their CLIENT_USER sub-accounts
       -- (lib/clientUsers.js), which share the same client_id.
       (SELECT COUNT(DISTINCT iu.client_id) FROM internal_users iu
          JOIN user_roles ur ON ur.internal_user_id = iu.internal_user_id
          JOIN roles r ON r.role_id = ur.role_id
          WHERE r.role_name = 'CLIENT_ADMIN' AND iu.client_id IS NOT NULL AND ${internalUserClientFilter})::int   AS clients_count,
       (SELECT COUNT(*) FROM document_processing_requests WHERE is_deleted = false AND ${userIdFilter})::int   AS total_requests,
       (SELECT COUNT(*) FROM document_processing_requests
          WHERE is_deleted = false AND status = 'COMPLETED' AND ${userIdFilter})::int                AS completed_requests,
       (SELECT COUNT(*) FROM document_processing_requests
          WHERE is_deleted = false AND status = 'FAILED' AND ${userIdFilter})::int                   AS failed_requests,
       (SELECT COUNT(*) FROM document_processing_requests
          WHERE is_deleted = false AND status IN ('PENDING','PROCESSING','QUEUED') AND ${userIdFilter})::int   AS pending_requests,
       (SELECT COUNT(DISTINCT document_type_id) FROM document_processing_requests
          WHERE is_deleted = false AND ${userIdFilter})::int                                         AS distinct_doc_types`,
    params
  );
  return result.rows[0] || null;
}

/**
 * Recent activity rows for the dashboard preview.
 * @param {number} [limit]
 * @param {object} [filters] - { clientId }
 */
export async function getRecentDexaiRequests(limit = 6, filters = {}) {
  const { clientId = "" } = filters;
  const whereConditions = ["d.is_deleted = false"];
  const params = [];
  let paramIndex = 1;

  if (clientId) {
    params.push(clientId);
    whereConditions.push(`d.user_id = $${paramIndex}`);
    paramIndex++;
  }

  params.push(limit);

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
     WHERE ${whereConditions.join(" AND ")}
     ORDER BY d.submitted_at DESC NULLS LAST
     LIMIT $${paramIndex}`,
    params
  );
  return result.rows;
}
