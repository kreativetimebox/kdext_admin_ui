// lib/clientProvisioningMonitor.js
//
// Background poll loop that auto-provisions a CLIENT_ADMIN login (lib/
// clientProvisioning.js) for any `users` row that doesn't have one yet, so
// new clients get portal access automatically instead of requiring someone
// to visit the Clients tab first. Started once at server boot (see
// instrumentation.js) — same idempotent-singleton pattern as
// lib/hitlAssignmentMonitor.js.
import { provisionAllMissingClients } from "./clientProvisioning";

const POLL_INTERVAL_MS = Number(process.env.CLIENT_PROVISION_POLL_INTERVAL_MS) || 60000;

async function tick() {
  const results = await provisionAllMissingClients();
  const created = results.filter((r) => r.ok && !r.skipped);
  const failed = results.filter((r) => !r.ok);
  if (created.length > 0) {
    console.log(`[client-provision] provisioned ${created.length} new client login(s)`);
  }
  if (failed.length > 0) {
    console.warn(`[client-provision] ${failed.length} client(s) could not be provisioned:`, failed);
  }
}

/** Idempotent singleton starter — see instrumentation.js. */
export function startClientProvisioningMonitor() {
  if (globalThis.__clientProvisioningMonitorStarted) return;
  globalThis.__clientProvisioningMonitorStarted = true;

  console.log(`[client-provision] polling started (every ${POLL_INTERVAL_MS / 1000}s)`);
  const run = () => tick().catch((err) => console.error("[client-provision] poll cycle failed:", err.message));
  run();
  setInterval(run, POLL_INTERVAL_MS);
}
