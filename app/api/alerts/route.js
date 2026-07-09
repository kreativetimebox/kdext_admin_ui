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
    `SELECT id, source, severity, server_id, server_name, container_name, category,
            message, detail, first_seen, last_seen, occurrences, notified_at, resolved_at
     FROM monitor_alerts
     ${where}
     ORDER BY (resolved_at IS NULL) DESC, severity ASC, last_seen DESC
     LIMIT 500`
  );

  return Response.json({ alerts: result.rows });
}
