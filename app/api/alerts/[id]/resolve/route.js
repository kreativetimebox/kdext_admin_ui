import { verifyAuthToken } from "@/lib/auth";
import { dexaiQuery } from "@/lib/dexaidb";

export const dynamic = "force-dynamic";

/**
 * Manually acknowledge/resolve an alert. Needed mainly for log_error alerts,
 * which have no automatic resolve signal (unlike metric/container_down alerts,
 * which clear themselves once the poll loop sees the condition go away).
 */
export async function POST(req, { params }) {
  const user = await verifyAuthToken(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.roles?.some((r) => ["SUPER_ADMIN", "SERVER_MONITOR"].includes(r)))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (!id || Number.isNaN(Number(id)))
    return Response.json({ error: "Invalid alert id" }, { status: 400 });

  const result = await dexaiQuery(
    "UPDATE monitor_alerts SET resolved_at = now() WHERE id = $1 AND resolved_at IS NULL RETURNING id",
    [Number(id)]
  );

  if (result.rowCount === 0)
    return Response.json({ error: "Alert not found or already resolved" }, { status: 404 });

  return Response.json({ status: "resolved", id: Number(id) });
}
