"use client";

import { useState } from "react";
import { Copy, Check, ScrollText } from "lucide-react";
import { copyToClipboard } from "@/lib/clipboard";
import { useAuth } from "@/lib/useAuth";
import { canViewRequestLogs } from "@/lib/requestLogsAccess";
import RequestLogsModal from "@/components/Logs/RequestLogsModal";
import ValidationDot from "@/components/Results/ValidationDot";

/**
 * Shared metadata panel rendered below the document preview on both document
 * detail pages — app/view/[id]/page.js (HITL EDIT) and
 * app/dexai/result/[requestId]/page.js (Business Audit). Deliberately a
 * single shared component (not duplicated per page, unlike most small
 * badge/cell renderers in this codebase) so the two pages can never drift
 * apart on which fields they show.
 *
 * `doc` is expected to carry the same field names on both pages — both
 * API routes (app/api/document/[id]/route.js and
 * app/api/dexai/result/[requestId]/route.js) were extended to return the
 * same shape for every field read here, with one exception: the document
 * type field is named differently on each page's API response
 * (ocr_document_type vs document_type), so callers pass it explicitly via
 * `documentType` instead.
 */

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function formatDuration(ms) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(2)} s`;
  const m = Math.floor(s / 60);
  const rem = (s % 60).toFixed(0);
  return `${m}m ${rem}s`;
}

function formatBytes(bytes) {
  if (bytes == null) return "—";
  const n = Number(bytes);
  if (!Number.isFinite(n)) return String(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  const handleCopy = async () => {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  return (
    <button
      onClick={handleCopy}
      title={`Copy ${label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 22,
        height: 22,
        borderRadius: 6,
        border: "1px solid var(--panel-border)",
        background: "var(--input-bg)",
        color: "var(--text-muted)",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      {copied ? <Check size={11} style={{ color: "#10b981" }} /> : <Copy size={11} />}
    </button>
  );
}

function MetaRow({ label, children, mono }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "140px 1fr",
        gap: 12,
        alignItems: "center",
        padding: "8px 0",
        borderBottom: "1px dashed var(--panel-border)",
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-muted)",
        }}
      >
        {label}
      </span>
      <div
        style={{
          fontSize: 13,
          color: "var(--foreground)",
          wordBreak: "break-all",
          fontFamily: mono ? "ui-monospace, SFMono-Regular, monospace" : undefined,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {children}
      </div>
    </div>
  );
}

const HITL_STATUS_COLORS = {
  COMPLETED: { bg: "var(--tag-green-bg)", color: "var(--tag-green-color)" },
  FAILED: { bg: "#fee2e2", color: "#b91c1c" },
  PENDING: { bg: "var(--tag-amber-bg)", color: "var(--tag-amber-color)" },
  PROCESSING: { bg: "var(--tag-bg)", color: "var(--accent)" },
  TO_BE_TESTED: { bg: "rgba(249,115,22,0.12)", color: "#f97316" },
};
function HitlStatusBadge({ status }) {
  if (!status) return <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>;
  const c = HITL_STATUS_COLORS[status] || { bg: "var(--input-bg)", color: "var(--text-muted)" };
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", padding: "3px 8px", borderRadius: 99, background: c.bg, color: c.color, whiteSpace: "nowrap" }}>
      {status}
    </span>
  );
}

// Tri-state flag badge for is_anomalous/is_duplicate — true is a flagged
// condition worth noticing (red), false is clean (muted "No"), and null
// means it was never evaluated.
function FlagBadge({ value }) {
  if (value === true) {
    return (
      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 99, background: "rgba(239,68,68,0.12)", color: "#ef4444", whiteSpace: "nowrap" }}>
        Yes
      </span>
    );
  }
  if (value === false) {
    return (
      <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 99, background: "var(--input-bg)", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
        No
      </span>
    );
  }
  return <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>;
}

const FRAUD_RISK_COLORS = {
  LOW: { bg: "rgba(34,197,94,0.12)", color: "#22c55e" },
  MEDIUM: { bg: "rgba(249,115,22,0.12)", color: "#f97316" },
  HIGH: { bg: "rgba(239,68,68,0.12)", color: "#ef4444" },
};
function FraudRiskBadge({ level }) {
  if (!level) return <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>;
  const c = FRAUD_RISK_COLORS[level] || { bg: "var(--input-bg)", color: "var(--text-muted)" };
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", padding: "3px 8px", borderRadius: 99, background: c.bg, color: c.color, whiteSpace: "nowrap" }}>
      {level}
    </span>
  );
}

export default function DocumentMetadataPanel({ doc, documentType }) {
  const { user } = useAuth();
  const showLogsOption = canViewRequestLogs(user);
  const [isLogsOpen, setIsLogsOpen] = useState(false);

  if (!doc) return null;

  const userFullName =
    [doc.user?.first_name, doc.user?.last_name].filter(Boolean).join(" ") || doc.user?.email || "—";

  return (
    <div
      style={{
        background: "var(--panel-bg)",
        border: "1px solid var(--panel-border)",
        borderRadius: 12,
        padding: "12px 16px 16px",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <h3
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-muted)",
          margin: "4px 0 8px",
        }}
      >
        Metadata
      </h3>

      {doc.result_id != null && (
        <MetaRow label="Result ID" mono>
          <span>{doc.result_id}</span>
          <CopyButton value={String(doc.result_id)} label="result_id" />
        </MetaRow>
      )}
      {doc.request_id && (
        <MetaRow label="Request ID" mono>
          <span>{doc.request_id}</span>
          <CopyButton value={doc.request_id} label="request_id" />
          {showLogsOption && (
            <button
              onClick={() => setIsLogsOpen(true)}
              title="View request execution logs"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 8px",
                borderRadius: 6,
                border: "1px solid rgba(168, 85, 247, 0.4)",
                background: "rgba(168, 85, 247, 0.12)",
                color: "var(--accent)",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                marginLeft: "auto",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(168, 85, 247, 0.22)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(168, 85, 247, 0.12)";
              }}
            >
              <ScrollText size={11} />
              Logs
            </button>
          )}
        </MetaRow>
      )}
      {doc.transaction_id && (
        <MetaRow label="Transaction ID" mono>
          <span>{doc.transaction_id}</span>
          <CopyButton value={doc.transaction_id} label="transaction_id" />
        </MetaRow>
      )}
      {doc.user && (
        <MetaRow label="User">
          <span>{userFullName}</span>
          {doc.user?.email && (
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>({doc.user.email})</span>
          )}
        </MetaRow>
      )}
      <MetaRow label="Document Type">
        {documentType ? (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: "3px 10px",
              borderRadius: 99,
              background: "var(--tag-purple-bg)",
              color: "var(--tag-purple-color)",
            }}
          >
            {documentType}
          </span>
        ) : (
          "—"
        )}
      </MetaRow>
      <MetaRow label="Environment">
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "3px 8px",
            borderRadius: 6,
            background: "var(--tag-purple-bg)",
            color: "var(--tag-purple-color)",
            textTransform: "capitalize",
          }}
        >
          {doc.key_environment || "production"}
        </span>
      </MetaRow>

      <MetaRow label="HITL Status">
        <HitlStatusBadge status={doc.hitl_status} />
      </MetaRow>
      <MetaRow label="Validation">
        <ValidationDot validation={doc.validation} />
      </MetaRow>
      <MetaRow label="HITL Assigned">
        {doc.hitl_assigned_to_name || "—"}
      </MetaRow>
      <MetaRow label="Created At">{formatDate(doc.created_at)}</MetaRow>
      {/* <MetaRow label="Fraud Risk">
        <FraudRiskBadge level={doc.fraud_risk_level} />
      </MetaRow>
      <MetaRow label="Anomalous">
        <FlagBadge value={doc.is_anomalous} />
      </MetaRow>
      <MetaRow label="Duplicate">
        <FlagBadge value={doc.is_duplicate} />
      </MetaRow> */}
      <MetaRow label="Original File" mono>
        {doc.original_filename || "—"}
      </MetaRow>
      <MetaRow label="File Size">{formatBytes(doc.file_size_bytes)}</MetaRow>
      <MetaRow label="Updated At">{formatDate(doc.updated_at)}</MetaRow>
      <MetaRow label="Submitted">{formatDate(doc.submitted_at)}</MetaRow>
      <MetaRow label="Completed">{formatDate(doc.completed_at)}</MetaRow>
      <MetaRow label="Duration">{formatDuration(doc.processing_duration_ms)}</MetaRow>
      {doc.error_message && (
        <MetaRow label="Error Message">
          <span
            style={{
              color: "#ef4444",
              fontSize: 12,
              lineHeight: 1.4,
              wordBreak: "break-word",
              background: "rgba(239, 68, 68, 0.08)",
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid rgba(239, 68, 68, 0.2)",
              display: "inline-block",
            }}
          >
            {doc.error_message}
          </span>
        </MetaRow>
      )}

      {showLogsOption && (
        <RequestLogsModal
          requestId={doc.request_id || doc.result_id}
          isOpen={isLogsOpen}
          onClose={() => setIsLogsOpen(false)}
          initialFilename={doc.original_filename}
        />
      )}
    </div>
  );
}
