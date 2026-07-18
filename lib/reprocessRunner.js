"use client";

import axios from "axios";
import toast from "react-hot-toast";
import { useReprocessStore } from "@/lib/store";

const POLL_INTERVAL_MS = 4000;
// process-document is async (worker + external extraction). Give it a generous
// window before we stop actively polling and tell the user to check back.
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

// Guards against running two poll loops for the same doc — e.g. a
// ReprocessRunnerProvider remount, or resumeAllJobs() firing twice.
const activeLoops = new Set();

let queryClientRef = null;

/** Called once by ReprocessRunnerProvider so the runner can invalidate
 * react-query caches without depending on whichever page started the job. */
export function registerQueryClient(queryClient) {
  queryClientRef = queryClient;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollUntilDone(docId, newRequestId) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const { data } = await axios.get(
      `/api/document/${encodeURIComponent(docId)}/reprocess`,
      { params: { newRequestId } }
    );
    if (data.done) return data;
  }
  return { status: "TIMEOUT", done: false };
}

async function runJob(docId, job) {
  const { newRequestId, documentType, oldRequestId, queryKey } = job;
  const toastId = `reprocess-${docId}`;
  try {
    const final = await pollUntilDone(docId, newRequestId);

    if (!final.done) {
      toast.error(
        "Reprocessing is taking longer than expected — check back shortly.",
        { id: toastId }
      );
      return;
    }
    if (final.status === "FAILED") {
      toast.error(final.error_message || "Reprocessing failed.", {
        id: toastId,
      });
      return;
    }

    await axios.put(`/api/document/${encodeURIComponent(docId)}/reprocess`, {
      newRequestId,
      documentType,
    });

    toast.success(`Request ${oldRequestId} reprocessed as ${documentType}.`, {
      id: toastId,
    });
    if (queryKey) queryClientRef?.invalidateQueries({ queryKey });
  } catch (err) {
    const msg =
      err?.response?.data?.error || err?.message || "Reprocessing failed.";
    toast.error(msg, { id: toastId });
  } finally {
    useReprocessStore.getState().removeJob(docId);
    activeLoops.delete(docId);
  }
}

/**
 * Kick off a reprocess for docId. Safe to call from any component — the
 * actual poll/commit cycle runs independently of whatever called it, so
 * navigating away (or even refreshing the page) won't abandon it.
 * @param {string} docId
 * @param {string} documentType
 * @param {Array} [queryKey] - react-query key to invalidate once committed.
 */
export async function startReprocess(docId, documentType, queryKey) {
  if (useReprocessStore.getState().jobs[docId]) return;

  const toastId = `reprocess-${docId}`;
  toast.loading("Starting reprocessing…", { id: toastId });

  try {
    const { data: started } = await axios.post(
      `/api/document/${encodeURIComponent(docId)}/reprocess`,
      { documentType }
    );

    const job = {
      oldRequestId: started.old_request_id,
      newRequestId: started.new_request_id,
      documentType,
      queryKey,
      startedAt: Date.now(),
    };
    useReprocessStore.getState().addJob(docId, job);
    toast.loading(
      `Request ${started.old_request_id} is reprocessing as ${documentType}…`,
      { id: toastId }
    );

    activeLoops.add(docId);
    runJob(docId, job);
  } catch (err) {
    const msg =
      err?.response?.data?.error ||
      err?.message ||
      "Failed to start reprocessing.";
    toast.error(msg, { id: toastId });
  }
}

/**
 * Resume polling for any jobs left in the persisted store — e.g. after a
 * hard refresh or the app being reopened while a reprocess was in flight.
 * Called once by ReprocessRunnerProvider on mount.
 */
export function resumeAllJobs() {
  const { jobs } = useReprocessStore.getState();
  Object.entries(jobs).forEach(([docId, job]) => {
    if (activeLoops.has(docId)) return;
    activeLoops.add(docId);
    runJob(docId, job);
  });
}
