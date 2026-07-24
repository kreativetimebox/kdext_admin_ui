// lib/failedDocumentMonitor.js
//
// Background trigger that automatically reprocesses every FAILED
// document_processing_requests row once a day, late at night, so the backlog
// clears itself without anyone having to run scripts/reprocess-failed.mjs by
// hand. Started once at server boot (see instrumentation.js), alongside the
// other background monitors — kept separate from those since this is a daily
// trigger, not a fast poll loop. Shares its actual reprocess logic with the
// CLI script via lib/reprocessFailedDocuments.js so the two can't drift apart.
import { reprocessFailedDocuments } from "./reprocessFailedDocuments.js";

const ENABLED = (process.env.AUTO_REPROCESS_ENABLED ?? "true") !== "false";
// Local server time. Defaults to midnight (00:00).
const RUN_HOUR = Number(process.env.AUTO_REPROCESS_HOUR) || 0;
const RUN_MINUTE = Number(process.env.AUTO_REPROCESS_MINUTE) || 0;
const CONCURRENCY = Number(process.env.AUTO_REPROCESS_CONCURRENCY) || 5;

/** Milliseconds from now until the next occurrence of hour:minute local time. */
function msUntilNext(hour, minute) {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

let isRunning = false;

async function runCycle() {
  if (isRunning) {
    console.warn("[auto-reprocess] previous cycle still running, skipping this trigger");
    return;
  }
  isRunning = true;
  try {
    console.log("[auto-reprocess] nightly cycle starting");
    const { found, attempted, ok, failures } = await reprocessFailedDocuments({
      concurrency: CONCURRENCY,
      onItemDone: (done, total, result) => {
        if (!result.ok) {
          console.log(`[auto-reprocess] [${done}/${total}] ${result.tag} SKIPPED — ${result.reason}`);
        }
      },
    });
    console.log(
      `[auto-reprocess] done. found=${found} attempted=${attempted} ok=${ok} failed=${failures.length}`
    );
    failures.forEach((f) => console.log(`[auto-reprocess]   ${f.tag}: ${f.reason}`));
  } catch (err) {
    console.error("[auto-reprocess] cycle failed:", err.message);
  } finally {
    isRunning = false;
  }
}

/**
 * Recursively reschedules itself to the next hour:minute occurrence after
 * each run (rather than a fixed 24h setInterval) so it self-corrects for
 * DST shifts and for a cycle that overruns into the next day.
 */
function scheduleNext() {
  const delay = msUntilNext(RUN_HOUR, RUN_MINUTE);
  setTimeout(() => {
    runCycle().finally(scheduleNext);
  }, delay);
  console.log(
    `[auto-reprocess] next run in ${Math.round(delay / 60000)} min ` +
      `(${String(RUN_HOUR).padStart(2, "0")}:${String(RUN_MINUTE).padStart(2, "0")} local time)`
  );
}

/** Idempotent singleton starter — see instrumentation.js. */
export function startFailedDocumentMonitor() {
  if (globalThis.__failedDocumentMonitorStarted) return;
  globalThis.__failedDocumentMonitorStarted = true;

  if (!ENABLED) {
    console.log("[auto-reprocess] disabled via AUTO_REPROCESS_ENABLED=false");
    return;
  }

  scheduleNext();
}
