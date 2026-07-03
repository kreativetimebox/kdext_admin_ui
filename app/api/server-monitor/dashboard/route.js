import { verifyAuthToken } from "@/lib/auth";
import { monitorFetch, listServers } from "@/lib/serverMonitor";

export const dynamic = "force-dynamic";

/**
 * Combined dashboard for one server: system stats, docker containers and GPUs.
 * Each sub-call is independent so one failing section doesn't blank the page.
 */
export async function GET(req) {
  const user = await verifyAuthToken(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.roles?.includes("SUPER_ADMIN"))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const server = searchParams.get("server") || "1";

  const safe = async (path) => {
    try {
      return await monitorFetch(server, path);
    } catch (e) {
      return { status: "error", message: e.message };
    }
  };

  const [system, containers, gpu] = await Promise.all([
    safe("/server_monitor/api/system"),
    safe("/server_monitor/api/docker/containers?all=true"),
    safe("/server_monitor/api/gpu"),
  ]);

  return Response.json({
    servers: listServers(),
    server,
    system: system?.data ?? null,
    systemError: system?.status === "error" ? system.message : null,
    dockerAvailable: containers?.available ?? false,
    containers: containers?.data ?? [],
    containersError: containers?.status === "error" ? containers.message : null,
    gpuAvailable: gpu?.available ?? false,
    gpus: gpu?.data ?? [],
  });
}
