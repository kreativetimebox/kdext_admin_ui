// lib/hitlAssignmentMonitor.js
//
// Background poll loop that auto-assigns unreviewed document_processing_requests
// rows to active HITL-role team members (lib/hitlAssignment.js), so newly
// uploaded documents that still need human review get picked up without
// anyone having to assign them by hand. Started once at server boot (see
// instrumentation.js) — kept separate from lib/alertMonitor.js since that
// file is scoped to server/GPU/container health, not document assignment.
import { autoAssignHitlReviews } from "./hitlAssignment";

const POLL_INTERVAL_MS = Number(process.env.HITL_ASSIGN_POLL_INTERVAL_MS) || 20000;

async function tick() {
  const { assigned, candidates, skippedReason } = await autoAssignHitlReviews();
  if (skippedReason) {
    console.warn(`[hitl-assign] skipped: ${skippedReason}`);
  } else if (assigned > 0) {
    console.log(`[hitl-assign] assigned ${assigned}/${candidates} pending review row(s)`);
  }
}

/** Idempotent singleton starter — see instrumentation.js. */
export function startHitlAssignmentMonitor() {
  if (globalThis.__hitlAssignmentMonitorStarted) return;
  globalThis.__hitlAssignmentMonitorStarted = true;

  console.log(`[hitl-assign] polling started (every ${POLL_INTERVAL_MS / 1000}s)`);
  const run = () => tick().catch((err) => console.error("[hitl-assign] poll cycle failed:", err.message));
  run();
  setInterval(run, POLL_INTERVAL_MS);
}
