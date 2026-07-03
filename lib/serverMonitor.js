/*
 * Server monitoring proxy.
 *
 * Each backend server runs a small Flask "server-monitor" app on port 5000 that
 * exposes docker/system/gpu info behind a session login. This module logs into
 * each of those apps once, caches the session cookie, and proxies their JSON
 * APIs so the admin UI can present a single, unified monitoring dashboard for
 * every server. Credentials/hosts come from env with sensible fallbacks.
 */

const MONITOR_USERNAME =
  process.env.MONITOR_USERNAME || "info@kreativetimebox.com";
const MONITOR_PASSWORD = process.env.MONITOR_PASSWORD || "Kreative@2026";

// The servers to monitor. Override hosts via env; ids are stable + used by the UI.
export const SERVERS = [
  {
    id: "1",
    name: "Server 1",
    host: process.env.MONITOR_SERVER_1_HOST || "46.243.55.155",
    port: Number(process.env.MONITOR_SERVER_1_PORT) || 5000,
  },
  {
    id: "2",
    name: "Server 2",
    host: process.env.MONITOR_SERVER_2_HOST || "217.16.188.48",
    port: Number(process.env.MONITOR_SERVER_2_PORT) || 5000,
  },
];

export function getServer(id) {
  return SERVERS.find((s) => s.id === String(id)) || null;
}

export function listServers() {
  return SERVERS.map(({ id, name, host }) => ({ id, name, host }));
}

const baseUrl = (server) => `http://${server.host}:${server.port}`;

// serverId -> session cookie string (e.g. "session=...")
const sessionCookies = new Map();

/** Log into a server's Flask monitor and cache its session cookie. */
async function login(server) {
  const body = new URLSearchParams({
    username: MONITOR_USERNAME,
    password: MONITOR_PASSWORD,
  });

  const res = await fetch(`${baseUrl(server)}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
  });

  const setCookie = res.headers.get("set-cookie");
  const match = setCookie && setCookie.match(/session=[^;]+/);
  if (!match) {
    throw new Error(`Login to ${server.name} failed (no session cookie)`);
  }
  const cookie = match[0];
  sessionCookies.set(server.id, cookie);
  return cookie;
}

/**
 * Fetch a path on a server's monitor, transparently (re)authenticating.
 * Returns the parsed JSON body. Throws on network / auth / non-OK responses.
 */
export async function monitorFetch(serverId, path, { method = "GET", json } = {}) {
  const server = getServer(serverId);
  if (!server) throw new Error(`Unknown server: ${serverId}`);

  const doRequest = async (cookie) =>
    fetch(`${baseUrl(server)}${path}`, {
      method,
      headers: {
        Cookie: cookie,
        ...(json ? { "Content-Type": "application/json" } : {}),
      },
      body: json ? JSON.stringify(json) : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });

  let cookie = sessionCookies.get(server.id) || (await login(server));
  let res = await doRequest(cookie);

  // A redirect (to /login) or 401 means the session expired — re-login once.
  if (res.status === 302 || res.status === 301 || res.status === 401) {
    cookie = await login(server);
    res = await doRequest(cookie);
  }

  if (!res.ok) {
    throw new Error(`${server.name} ${path} returned ${res.status}`);
  }
  return res.json();
}
