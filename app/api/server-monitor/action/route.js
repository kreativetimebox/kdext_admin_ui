import { verifyAuthToken } from "@/lib/auth";
import { monitorFetch } from "@/lib/serverMonitor";

export const dynamic = "force-dynamic";

const ALLOWED = ["start", "stop", "restart", "remove"];

/** Perform a lifecycle action on a container (start/stop/restart/remove). */
export async function POST(req) {
  const user = await verifyAuthToken(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.roles?.includes("SUPER_ADMIN"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { server = "1", container_id, action } = await req.json();

  if (!container_id || !ALLOWED.includes(action))
    return Response.json({ error: "Invalid request" }, { status: 400 });

  try {
    const data = await monitorFetch(server, "/server_monitor/api/docker/action", {
      method: "POST",
      json: { container_id, action },
    });
    return Response.json({ status: data?.status ?? "success", action, container_id });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
}
