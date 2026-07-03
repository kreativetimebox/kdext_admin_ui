"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { RefreshCw } from "lucide-react";

// Types the pipeline supports — mirrors the API's _VALID_DOCUMENT_TYPES.
const DOCUMENT_TYPES = [
  "InvoicePDF",
  "InvoiceImage",
  "ReceiptPDF",
  "ReceiptImage",
  "BankStatementPDF",
];

const POLL_INTERVAL_MS = 4000;
// process-document is async (worker + external extraction). Give it a generous
// window before we stop actively polling and tell the user to check back.
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Reprocess control: a document-type dropdown + a button that re-runs the
 * pipeline for this document and overwrites its result in place (the original
 * request_id is preserved). Runs a start -> poll -> commit cycle because the
 * OCR pipeline is asynchronous.
 *
 * @param {object} props
 * @param {string} props.docId          - result_id OR request_id (used in the API route path)
 * @param {string} [props.currentType]  - the document's current type (dropdown default)
 * @param {() => void} [props.onReprocessed] - called after the result is applied
 */
export default function ReprocessControl({ docId, currentType, onReprocessed }) {
  const encodedId = encodeURIComponent(docId);
  const [documentType, setDocumentType] = useState(
    DOCUMENT_TYPES.includes(currentType) ? currentType : DOCUMENT_TYPES[0]
  );
  const [busy, setBusy] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    // If the component unmounts mid-run, stop the poll loop from touching state.
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function pollUntilDone(newRequestId) {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (cancelledRef.current) return null;
      await sleep(POLL_INTERVAL_MS);
      const { data } = await axios.get(
        `/api/document/${encodedId}/reprocess`,
        { params: { newRequestId } }
      );
      if (data.done) return data; // COMPLETED or FAILED
    }
    return { status: "TIMEOUT", done: false };
  }

  async function handleReprocess() {
    if (busy) return;
    setBusy(true);
    cancelledRef.current = false;

    const runToast = toast.loading("Starting reprocessing…");
    try {
      // 1. Kick off — creates a transient request against the OCR pipeline.
      const { data: started } = await axios.post(
        `/api/document/${encodedId}/reprocess`,
        { documentType }
      );

      toast.loading(
        `Request ${started.old_request_id} is reprocessing as ${documentType}…`,
        { id: runToast }
      );

      // 2. Poll the transient request to completion.
      const final = await pollUntilDone(started.new_request_id);
      if (cancelledRef.current) return;

      if (!final || !final.done) {
        toast.error(
          "Reprocessing is taking longer than expected — check back shortly.",
          { id: runToast }
        );
        return;
      }
      if (final.status === "FAILED") {
        toast.error(final.error_message || "Reprocessing failed.", { id: runToast });
        return;
      }

      // 3. Commit — overwrite the original document's result in place.
      await axios.put(`/api/document/${encodedId}/reprocess`, {
        newRequestId: started.new_request_id,
        documentType,
      });

      toast.success(
        `Request ${started.old_request_id} reprocessed as ${documentType}.`,
        { id: runToast }
      );
      onReprocessed?.();
    } catch (err) {
      const msg =
        err?.response?.data?.error || err?.message || "Reprocessing failed.";
      toast.error(msg, { id: runToast });
    } finally {
      if (!cancelledRef.current) setBusy(false);
    }
  }

  return (
    <div
      className="flex items-center gap-2 flex-wrap"
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid var(--panel-border)",
        background: "var(--input-bg)",
      }}
    >
      <span className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        Reprocess
      </span>
      <select
        value={documentType}
        onChange={(e) => setDocumentType(e.target.value)}
        disabled={busy}
        style={{
          padding: "6px 10px",
          borderRadius: 8,
          fontSize: 13,
          border: "1px solid var(--panel-border)",
          background: "var(--background)",
          color: "var(--foreground)",
          cursor: busy ? "not-allowed" : "pointer",
        }}
      >
        {DOCUMENT_TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <button
        onClick={handleReprocess}
        disabled={busy}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 14px",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          border: "1px solid var(--panel-border)",
          background: busy ? "var(--input-bg)" : "var(--brand-gradient)",
          color: busy ? "var(--text-muted)" : "#fff",
          cursor: busy ? "not-allowed" : "pointer",
          transition: "all 0.15s ease",
        }}
      >
        <RefreshCw size={13} className={busy ? "animate-spin" : ""} />
        {busy ? "Reprocessing…" : "Reprocess"}
      </button>
    </div>
  );
}
