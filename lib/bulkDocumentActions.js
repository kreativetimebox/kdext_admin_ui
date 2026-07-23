"use client";

// Bulk-apply helpers for the grid tables (HITL EDIT, Bug Tracker, Business
// Audit) — reuse the exact same single-row endpoints each table's row-level
// dropdowns already call, just looped over a selected set of ids with
// limited concurrency instead of one row at a time.
import axios from "axios";

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

async function bulkPost(ids, buildRequest, { concurrency = 5, onProgress } = {}) {
  let done = 0;
  const total = ids.length;
  const outcomes = await runWithConcurrency(ids, concurrency, async (id) => {
    try {
      const { url, body } = buildRequest(id);
      const res = await axios.post(url, body);
      onProgress?.(++done, total);
      return res.data?.ok === false ? "failed" : "succeeded";
    } catch {
      onProgress?.(++done, total);
      return "failed";
    }
  });
  return {
    succeeded: outcomes.filter((o) => o === "succeeded").length,
    failed: outcomes.filter((o) => o === "failed").length,
  };
}

/** Same endpoint BugStatusDropCell/BugStatusCell already call per-row. */
export function bulkSetBugStatus(resultIds, bugStatus, opts) {
  return bulkPost(
    resultIds,
    (id) => ({ url: `/api/document/${encodeURIComponent(id)}/update-bug-tracking`, body: { bugStatus } }),
    opts
  );
}

/** Same endpoint missing-fields' per-row StatusDropCell already calls. */
export function bulkSetHitlStatus(resultIds, status, opts) {
  return bulkPost(
    resultIds,
    (id) => ({ url: `/api/document/${encodeURIComponent(id)}/update-status`, body: { status } }),
    opts
  );
}

/** Same endpoint HitlAssignCell already calls — server-side still enforces
 * the assign-hitl allow-list regardless of who's driving the bulk action. */
export function bulkAssignHitl(resultIds, hitlUserId, opts) {
  return bulkPost(
    resultIds,
    (id) => ({ url: `/api/document/${encodeURIComponent(id)}/assign-hitl`, body: { hitlUserId: hitlUserId || null } }),
    opts
  );
}
