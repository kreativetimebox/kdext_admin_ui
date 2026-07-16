import { verifyAuthToken } from "@/lib/auth";
import { dexaiQuery } from "@/lib/dexaidb";
import { ensureAlertsTable } from "@/lib/alertMonitor";

export const dynamic = "force-dynamic";

/** Lightweight counts for the navbar badge — no row data, just totals. */
export async function GET(req) {
  const user = await verifyAuthToken(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.roles?.some((r) => ["SUPER_ADMIN", "SERVER_MONITOR"].includes(r)))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  await ensureAlertsTable();

  const result = await dexaiQuery(`
    SELECT
      COUNT(*) FILTER (WHERE resolved_at IS NULL AND severity = 'critical')::int AS active_critical,
      COUNT(*) FILTER (WHERE resolved_at IS NULL AND severity = 'warning')::int  AS active_warning
    FROM monitor_alerts
  `);

  const row = result.rows[0] || { active_critical: 0, active_warning: 0 };
  return Response.json({ activeCritical: row.active_critical, activeWarning: row.active_warning });
}
