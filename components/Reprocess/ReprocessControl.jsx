"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useReprocessStore } from "@/lib/store";
import { startReprocess } from "@/lib/reprocessRunner";

// Types the pipeline supports — mirrors the API's _VALID_DOCUMENT_TYPES.
const DOCUMENT_TYPES = [
  "InvoicePDF",
  "InvoiceImage",
  "ReceiptPDF",
  "ReceiptImage",
  "BankStatementPDF",
];

/**
 * Reprocess control: a document-type dropdown + a button that re-runs the
 * pipeline for this document and overwrites its result in place (the original
 * request_id is preserved).
 *
 * The actual start -> poll -> commit cycle runs in lib/reprocessRunner.js,
 * independent of this component's lifecycle, so navigating away (or even a
 * hard refresh) doesn't abandon an in-flight reprocess. This component just
 * reflects whether a job for docId is currently running.
 *
 * @param {object} props
 * @param {string} props.docId          - result_id OR request_id (used in the API route path)
 * @param {string} [props.currentType]  - the document's current type (dropdown default)
 * @param {Array} [props.queryKey]      - react-query key to invalidate once the reprocess commits
 */
export default function ReprocessControl({ docId, currentType, queryKey }) {
  const [documentType, setDocumentType] = useState(
    DOCUMENT_TYPES.includes(currentType) ? currentType : DOCUMENT_TYPES[0]
  );
  const busy = useReprocessStore((state) => !!state.jobs[docId]);

  function handleReprocess() {
    if (busy) return;
    startReprocess(docId, documentType, queryKey);
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
