"use client";

import { AlertTriangle, FileX, FileWarning, ScrollText, Info, AlertCircle } from "lucide-react";

/**
 * Parses the raw pipeline error string into a clean, human-readable summary
 * and detailed explanation.
 */
export function parseDocumentError(errorMessage, status, documentType) {
  if (!errorMessage && status !== "FAILED") return null;

  const raw = (errorMessage || "").trim();

  // 1. Classification: Not a financial document
  if (
    raw.toLowerCase().includes("could not be identified as an invoice") ||
    raw.toLowerCase().includes("not a financial document") ||
    raw.toLowerCase().includes("not an invoice, receipt, or bank statement") ||
    raw.toLowerCase().includes("not contain any financial") ||
    raw.toLowerCase().includes("document type could not be identified")
  ) {
    // Extract the "Reason: ..." part if present
    let cleanReason = raw;
    const reasonMatch = raw.match(/Reason:\s*(?:Qwen2\.5-VL:\s*)?(.+)/i);
    if (reasonMatch && reasonMatch[1]) {
      cleanReason = reasonMatch[1].trim();
    }

    return {
      type: "invalid_document",
      title: "Invalid Financial Document",
      badge: "NON-FINANCIAL FILE",
      severity: "amber",
      summary: "This file was rejected by the AI classifier because it is not a supported invoice, receipt, or bank statement.",
      reason: cleanReason,
      guidance: "No structured financial fields (merchant, totals, line items) were extracted. Please ensure the uploaded file is a valid, readable receipt, invoice, or bank statement.",
    };
  }

  // 2. Corrupted PDF / File format error
  if (
    raw.toLowerCase().includes("syntax error") ||
    raw.toLowerCase().includes("couldn't find trailer dictionary") ||
    raw.toLowerCase().includes("unable to get page count") ||
    raw.toLowerCase().includes("corrupt") ||
    raw.toLowerCase().includes("cannot read xref")
  ) {
    return {
      type: "corrupt_file",
      title: "Corrupted or Unreadable File",
      badge: "FILE FORMAT ERROR",
      severity: "rose",
      summary: "The document file appears to be corrupted, incomplete, or formatted incorrectly.",
      reason: "The PDF/image parser could not read the document structure.",
      guidance: "The pipeline was unable to parse this file. Please re-export or re-scan the original document as a standard PDF/PNG/JPEG and upload again.",
    };
  }

  // 3. Exceeded max pages
  if (raw.toLowerCase().includes("exceeding the") && raw.toLowerCase().includes("page limit")) {
    return {
      type: "page_limit",
      title: "Page Limit Exceeded",
      badge: "PAGE LIMIT EXCEEDED",
      severity: "amber",
      summary: "The document exceeds the maximum allowable page limit for automated extraction.",
      reason: raw,
      guidance: "Please split the multi-page document into smaller files (under 30 pages) and resubmit.",
    };
  }

  // 4. Timeout
  if (raw.toLowerCase().includes("timeout") || raw.toLowerCase().includes("timed out")) {
    return {
      type: "timeout",
      title: "Processing Timeout",
      badge: "TIMEOUT",
      severity: "rose",
      summary: "Document processing took longer than expected and timed out.",
      reason: raw,
      guidance: "You can click 'Reprocess Document' to retry processing this file.",
    };
  }

  // 5. Generic / System pipeline failure
  return {
    type: "pipeline_failure",
    title: status === "FAILED" ? "Document Processing Failed" : "Processing Notice",
    badge: status === "FAILED" ? "FAILED" : "WARNING",
    severity: "rose",
    summary: raw || "Document processing could not be completed successfully.",
    reason: raw || "Extraction engine encountered an error while processing this document.",
    guidance: "Review the execution logs below or retry processing with the Reprocess control.",
  };
}

export default function DocumentFailureBanner({
  doc,
  onOpenLogs,
  showLogsButton = false,
}) {
  const status = doc?.status;
  const errorMessage = doc?.error_message;
  const isFailed = status === "FAILED";
  const hasError = !!errorMessage;

  if (!isFailed && !hasError) {
    return null;
  }

  const parsed = parseDocumentError(errorMessage, status, doc?.ocr_document_type || doc?.document_type);
  if (!parsed) return null;

  const isAmber = parsed.severity === "amber";

  const bannerTheme = isAmber
    ? {
        border: "rgba(245, 158, 11, 0.35)",
        bg: "rgba(245, 158, 11, 0.07)",
        badgeBg: "rgba(245, 158, 11, 0.18)",
        badgeColor: "#d97706",
        iconColor: "#d97706",
        titleColor: "var(--foreground)",
        calloutBg: "rgba(245, 158, 11, 0.12)",
        calloutBorder: "rgba(245, 158, 11, 0.25)",
      }
    : {
        border: "rgba(239, 68, 68, 0.35)",
        bg: "rgba(239, 68, 68, 0.07)",
        badgeBg: "rgba(239, 68, 68, 0.18)",
        badgeColor: "#ef4444",
        iconColor: "#ef4444",
        titleColor: "var(--foreground)",
        calloutBg: "rgba(239, 68, 68, 0.1)",
        calloutBorder: "rgba(239, 68, 68, 0.25)",
      };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "16px 20px",
        borderRadius: 12,
        background: bannerTheme.bg,
        border: `1px solid ${bannerTheme.border}`,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: bannerTheme.badgeBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {isAmber ? (
              <FileWarning size={17} style={{ color: bannerTheme.iconColor }} />
            ) : (
              <AlertCircle size={17} style={{ color: bannerTheme.iconColor }} />
            )}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: bannerTheme.titleColor, margin: 0 }}>
                {parsed.title}
              </h3>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  padding: "2px 7px",
                  borderRadius: 99,
                  background: bannerTheme.badgeBg,
                  color: bannerTheme.badgeColor,
                  textTransform: "uppercase",
                }}
              >
                {parsed.badge}
              </span>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "3px 0 0" }}>
              {parsed.summary}
            </p>
          </div>
        </div>

        {showLogsButton && onOpenLogs && (
          <button
            type="button"
            onClick={onOpenLogs}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "6px 12px",
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 600,
              border: "1px solid rgba(168, 85, 247, 0.35)",
              background: "rgba(168, 85, 247, 0.12)",
              color: "var(--accent)",
              cursor: "pointer",
              flexShrink: 0,
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(168, 85, 247, 0.22)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(168, 85, 247, 0.12)";
            }}
          >
            <ScrollText size={12} />
            View Logs
          </button>
        )}
      </div>

      {/* Error Callout */}
      {parsed.reason && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            background: bannerTheme.calloutBg,
            border: `1px solid ${bannerTheme.calloutBorder}`,
            fontSize: 12,
            lineHeight: 1.5,
            color: "var(--foreground)",
          }}
        >
          <span style={{ fontWeight: 700, color: bannerTheme.badgeColor, marginRight: 6 }}>
            Reason:
          </span>
          <span style={{ fontFamily: parsed.type === "corrupt_file" ? "ui-monospace, monospace" : "inherit" }}>
            {parsed.reason}
          </span>
        </div>
      )}

      {/* Guidance note */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 11.5, color: "var(--text-muted)" }}>
        <Info size={13} style={{ marginTop: 2, flexShrink: 0 }} />
        <span>{parsed.guidance}</span>
      </div>
    </div>
  );
}
