"use client";

// Bulk "reprocess up to 50 failed documents" action for the Alerts tab.
// Deliberately separate from lib/reprocessRunner.js's single-document job
// runner: that runner is tied to a global Zustand store keyed by docId (one
// job per doc, persisted across navigation, with its own toasts and a
// redirect to /view/[id] once a job needing review commits) — running that
// as-is for 50 documents at once would fire 50 toasts and could redirect the
// page 50 times. This module just does the raw start/poll/commit calls
// silently and reports aggregate progress instead.
import axios from "axios";
import { pollUntilDone } from "@/lib/reprocessRunner";

// Mirrors ReprocessControl.jsx's DOCUMENT_TYPES / the API's _VALID_DOCUMENT_TYPES.
const VALID_DOCUMENT_TYPES = new Set([
  "InvoicePDF",
  "InvoiceImage",
  "ReceiptPDF",
  "ReceiptImage",
  "BankStatementPDF",
]);

async function reprocessOneDocument(docId, documentType) {
  const { data: started } = await axios.post(
    `/api/document/${encodeURIComponent(docId)}/reprocess`,
    { documentType }
  );

  const final = await pollUntilDone(docId, started.new_request_id);
  if (!final.done) return { ok: false, reason: "timeout" };
  if (final.status === "FAILED") return { ok: false, reason: final.error_message || "failed" };

  await axios.put(`/api/document/${encodeURIComponent(docId)}/reprocess`, {
    newRequestId: started.new_request_id,
    documentType,
  });
  return { ok: true };
}

// Simple fixed-size concurrency pool: `limit` workers pull the next item off
// the shared queue as soon as they finish, so the external OCR pipeline
// never sees more than `limit` requests in flight at once.
async function runWithConcurrency(items, limit, worker) {
  const queue = [...items];
  const results = [];
  async function runner() {
    while (queue.length) {
      const item = queue.shift();
      results.push(await worker(item));
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}

/**
 * Reprocesses up to `alerts.length` documents (already capped to 50 by the
 * caller) with `concurrency` in flight at a time. For each document that
 * reprocesses without error, immediately resolves its alert (rather than
 * waiting for the next background reconcile tick) via
 * POST /api/alerts/[id]/resolve.
 *
 * @param {Array<{id:number, container_name:string, document_type:string|null}>} alerts
 * @param {object} [opts]
 * @param {number} [opts.concurrency=5]
 * @param {(done:number, total:number) => void} [opts.onProgress]
 * @returns {Promise<{resolved:number, failed:number, skipped:number}>}
 */
export async function bulkReprocessAlerts(alerts, { concurrency = 5, onProgress } = {}) {
  let done = 0;
  const total = alerts.length;
  const tick = () => onProgress?.(++done, total);

  const outcomes = await runWithConcurrency(alerts, concurrency, async (alert) => {
    if (!VALID_DOCUMENT_TYPES.has(alert.document_type)) {
      tick();
      return "skipped";
    }
    try {
      const result = await reprocessOneDocument(alert.container_name, alert.document_type);
      if (!result.ok) {
        tick();
        return "failed";
      }
      await axios.post(`/api/alerts/${alert.id}/resolve`);
      tick();
      return "resolved";
    } catch {
      tick();
      return "failed";
    }
  });

  return {
    resolved: outcomes.filter((o) => o === "resolved").length,
    failed: outcomes.filter((o) => o === "failed").length,
    skipped: outcomes.filter((o) => o === "skipped").length,
  };
}
