import { verifyAuthToken } from "@/lib/auth";
import { monitorFetch } from "@/lib/serverMonitor";

export const dynamic = "force-dynamic";

/** Tail docker logs for a container on a given server. */
export async function GET(req) {
  const user = await verifyAuthToken(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.roles?.some((r) => ["SUPER_ADMIN", "SERVER_MONITOR"].includes(r)))
    return Response.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const server = searchParams.get("server") || "1";
  const container = searchParams.get("container");
  const linesParam = searchParams.get("lines");

  // "all" (or omitted) => full logs. The upstream monitor requires an integer
  // tail, so we pass a very large value; docker returns the entire log when the
  // tail exceeds the total line count.
  const ALL = 100_000_000;
  const lines =
    !linesParam || linesParam === "all"
      ? ALL
      : Math.min(Math.max(Number(linesParam) || ALL, 1), ALL);

  if (!container)
    return Response.json({ error: "Missing container" }, { status: 400 });

  try {
    const data = await monitorFetch(
      server,
      `/server_monitor/api/docker/logs/${encodeURIComponent(container)}?lines=${lines}`
    );
    return Response.json({ logs: data?.logs ?? "", container });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
}
