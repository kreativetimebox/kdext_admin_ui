/**
 * Shared "reprocess every FAILED document_processing_requests row" logic —
 * same start -> poll -> commit cycle as the /reprocess API route (see
 * lib/queries.js, lib/ocrClient.js, lib/aws.js). Used by both the manual CLI
 * (scripts/reprocess-failed.mjs) and the automatic nightly trigger
 * (lib/failedDocumentMonitor.js) so the two never drift apart.
 */
import { dexaiQuery } from "./dexaidb.js";
import {
  getReprocessTarget,
  getRequestStatus,
  commitReprocessedResult,
} from "./queries.js";
import { getSignedFileUrl } from "./aws.js";
import { submitReprocess } from "./ocrClient.js";

const POLL_INTERVAL_MS = 5000;
// A first live batch against /process-async took ~17 min per doc under load
// (vs ~10-25s typically) — 10 min was cutting jobs off before they actually
// finished, wasting completed GPU work when the run gave up right before
// commit. 30 min gives real headroom without waiting forever on a truly dead job.
const POLL_TIMEOUT_MS = 30 * 60 * 1000;
const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED"]);
const DEFAULT_CONCURRENCY = 5;

function isPdf(path) {
  return /\.pdf($|\?)/i.test(path || "");
}

/**
 * Map the document's free-text type (ocr_document_type / document_types.type_name)
 * plus the source file extension to the pipeline's enum. Mirrors the type
 * matching in lib/queries.js's RESOLVED_TYPE_LOWER / RESOLVED_TYPE_COMPACT.
 * Returns null when the type can't be confidently classified.
 */
export function resolveDocumentType(rawType, sourceFile) {
  const t = (rawType || "").toLowerCase();
  const compact = t.replace(/[^a-z]/g, "");
  const pdf = isPdf(sourceFile);

  if (t.includes("bank statement") || compact.includes("bankstatement")) {
    return "BankStatementPDF"; // no image variant in the pipeline's enum
  }
  if (t.includes("receipt")) return pdf ? "ReceiptPDF" : "ReceiptImage";
  if (t.includes("invoice")) return pdf ? "InvoicePDF" : "InvoiceImage";
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fixed-size concurrency pool: `limit` workers pull the next item off the
// shared queue as soon as they finish, so the external OCR pipeline never
// sees more than `limit` requests in flight at once.
async function runWithConcurrency(items, limit, worker) {
  const queue = items.map((item, index) => ({ item, index }));
  const results = new Array(items.length);
  async function runner() {
    while (queue.length) {
      const { item, index } = queue.shift();
      results[index] = await worker(item, index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, runner)
  );
  return results;
}

async function pollUntilDone(requestId, tag, onHeartbeat) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let polls = 0;
  const heartbeatEveryNPolls = Math.round(30000 / POLL_INTERVAL_MS);
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const row = await getRequestStatus(requestId);
    const status = row?.status || "PENDING";
    if (TERMINAL_STATUSES.has(status)) {
      return { status, error_message: row?.error_message || null };
    }
    polls++;
    if (polls % heartbeatEveryNPolls === 0) {
      onHeartbeat?.(tag, status, Math.round((polls * POLL_INTERVAL_MS) / 1000));
    }
  }
  return { status: "TIMEOUT" };
}

export async function getFailedDocumentRows() {
  const { rows } = await dexaiQuery(
    `SELECT result_id, request_id, document_path, ocr_document_type
       FROM document_processing_requests
      WHERE status = 'FAILED'
        AND is_deleted = false
      ORDER BY submitted_at DESC NULLS LAST`,
    []
  );
  return rows;
}

/**
 * Reprocess a single FAILED row end-to-end: resolve target -> presign ->
 * submit -> poll -> commit -> resolve its monitor_alerts row (if any).
 */
export async function reprocessOneFailedRow(row, { dryRun = false, onHeartbeat } = {}) {
  const tag = row.request_id || row.result_id;
  const target = await getReprocessTarget(row.result_id || row.request_id);
  if (!target) return { ok: false, tag, reason: "reprocess target not found" };
  if (!target.source_file) return { ok: false, tag, reason: "no source file to reprocess" };

  const documentType = resolveDocumentType(target.document_type, target.source_file);
  if (!documentType) {
    return {
      ok: false,
      tag,
      reason: `could not resolve pipeline document type from "${target.document_type}"`,
    };
  }

  if (dryRun) return { ok: true, tag, dryRun: true, documentType };

  const signedUrl = await getSignedFileUrl(target.source_file);
  if (!signedUrl) return { ok: false, tag, reason: "source file missing in S3" };

  const submitted = await submitReprocess({ s3Url: signedUrl, documentType });
  if (!submitted.ok) return { ok: false, tag, reason: submitted.message || "failed to start reprocessing" };

  const final = await pollUntilDone(submitted.newRequestId, tag, onHeartbeat);
  if (final.status !== "COMPLETED") {
    return { ok: false, tag, reason: final.error_message || `reprocessing ended as ${final.status}` };
  }

  const committed = await commitReprocessedResult({
    targetId: row.result_id || row.request_id,
    newRequestId: submitted.newRequestId,
    documentType,
  });
  if (!committed) return { ok: false, tag, reason: "commit failed (no matching row)" };

  // Commit lands on the ORIGINAL row under its original request_id (see
  // commitReprocessedResult) — resolve that row's alert immediately instead of
  // waiting on alertMonitor.js's 30s reconcile poll. Matches container_name,
  // which is where alertMonitor stores the request_id for document alerts.
  if (row.request_id) {
    await dexaiQuery(
      `UPDATE monitor_alerts SET resolved_at = now()
       WHERE category = 'document_failed' AND resolved_at IS NULL AND container_name = $1`,
      [row.request_id]
    );
  }

  return { ok: true, tag, documentType };
}

/**
 * Find every FAILED document_processing_requests row and reprocess it, up to
 * `concurrency` in flight at once.
 *
 * @param {object} [opts]
 * @param {number} [opts.limit] - only process the first N failed rows.
 * @param {number} [opts.concurrency=5]
 * @param {boolean} [opts.dryRun=false]
 * @param {(found:number, attempted:number) => void} [opts.onStart]
 * @param {(done:number, total:number, result:object) => void} [opts.onItemDone]
 * @param {(tag:string, status:string, elapsedS:number) => void} [opts.onHeartbeat]
 * @returns {Promise<{found:number, attempted:number, ok:number, failures:Array<{tag:string, reason:string}>}>}
 */
export async function reprocessFailedDocuments({
  limit,
  concurrency = DEFAULT_CONCURRENCY,
  dryRun = false,
  onStart,
  onItemDone,
  onHeartbeat,
} = {}) {
  const rows = await getFailedDocumentRows();
  const targets = limit ? rows.slice(0, limit) : rows;
  onStart?.(rows.length, targets.length);

  let ok = 0;
  let done = 0;
  const failures = [];

  await runWithConcurrency(targets, concurrency, async (row) => {
    try {
      const result = await reprocessOneFailedRow(row, { dryRun, onHeartbeat });
      done++;
      if (result.ok) ok++;
      else failures.push({ tag: result.tag, reason: result.reason });
      onItemDone?.(done, targets.length, result);
    } catch (err) {
      done++;
      const tag = row.request_id || row.result_id;
      failures.push({ tag, reason: err.message });
      onItemDone?.(done, targets.length, { ok: false, tag, reason: err.message });
    }
  });

  return { found: rows.length, attempted: targets.length, ok, failures };
}
