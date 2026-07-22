import { verifyAuthToken } from "@/lib/auth";
import { dexaiQuery } from "@/lib/dexaidb";
import { ensureAlertsTable } from "@/lib/alertMonitor";

export const dynamic = "force-dynamic";

/** List alerts detected by the background monitor (lib/alertMonitor.js). */
export async function GET(req) {
  const user = await verifyAuthToken(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.roles?.some((r) => ["SUPER_ADMIN", "SERVER_MONITOR"].includes(r)))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  await ensureAlertsTable();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "active";

  const where =
    status === "active" ? "WHERE resolved_at IS NULL" :
    status === "resolved" ? "WHERE resolved_at IS NOT NULL" :
    "";

  const result = await dexaiQuery(
    `SELECT ma.id, ma.source, ma.severity, ma.server_id, ma.server_name, ma.container_name, ma.category,
            ma.message, ma.detail, ma.first_seen, ma.last_seen, ma.occurrences, ma.notified_at, ma.resolved_at,
            d.result_id AS document_result_id,
            COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) AS document_type
     FROM monitor_alerts ma
     -- Document-category alerts store the request_id in container_name (see
     -- alertMonitor.js's checkDocumentFailures/checkStuckDocuments); resolve
     -- it to a result_id here so the UI can link straight to /view/[id]
     -- instead of the request_id-keyed /dexai/result page, and to a
     -- document_type so the bulk-reprocess action knows what to submit. Both
     -- joins are a no-op for server-category alerts, whose container_name
     -- never matches a request_id.
     LEFT JOIN document_processing_requests d
       ON d.request_id = ma.container_name AND d.is_deleted = false
     LEFT JOIN document_types dt ON dt.document_type_id = d.document_type_id
     ${where}
     ORDER BY (ma.resolved_at IS NULL) DESC, ma.severity ASC, ma.last_seen DESC
     LIMIT 500`
  );

  return Response.json({ alerts: result.rows });
}
