"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
  X,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  ScrollText,
  FileCode,
  Terminal,
  Layers,
  ArrowRight,
} from "lucide-react";
import { copyToClipboard } from "@/lib/clipboard";
import toast from "react-hot-toast";

function formatTimestamp(value) {
  if (!value) return "—";
  try {
    const d = new Date(value);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const seconds = String(d.getSeconds()).padStart(2, "0");
    return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
  } catch {
    return String(value);
  }
}

function formatStageName(stage) {
  if (!stage) return "General";
  return stage
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

const STAGE_COLORS = {
  queued: { bg: "rgba(148, 163, 184, 0.15)", text: "#94a3b8", border: "rgba(148, 163, 184, 0.3)" },
  s3_upload: { bg: "rgba(168, 85, 247, 0.15)", text: "#c084fc", border: "rgba(168, 85, 247, 0.3)" },
  s3_download: { bg: "rgba(168, 85, 247, 0.15)", text: "#c084fc", border: "rgba(168, 85, 247, 0.3)" },
  received: { bg: "rgba(59, 130, 246, 0.15)", text: "#60a5fa", border: "rgba(59, 130, 246, 0.3)" },
  dispatched: { bg: "rgba(99, 102, 241, 0.15)", text: "#818cf8", border: "rgba(99, 102, 241, 0.3)" },
  rabbitmq_delivery: { bg: "rgba(99, 102, 241, 0.15)", text: "#818cf8", border: "rgba(99, 102, 241, 0.3)" },
  classify: { bg: "rgba(192, 132, 252, 0.15)", text: "#e879f9", border: "rgba(192, 132, 252, 0.3)" },
  processing_started: { bg: "rgba(14, 165, 233, 0.15)", text: "#38bdf8", border: "rgba(14, 165, 233, 0.3)" },
  extraction_triggered: { bg: "rgba(20, 184, 166, 0.15)", text: "#2dd4bf", border: "rgba(20, 184, 166, 0.3)" },
  receipt_extraction: { bg: "rgba(16, 185, 129, 0.15)", text: "#34d399", border: "rgba(16, 185, 129, 0.3)" },
  invoice_extraction: { bg: "rgba(16, 185, 129, 0.15)", text: "#34d399", border: "rgba(16, 185, 129, 0.3)" },
  bank_extraction: { bg: "rgba(16, 185, 129, 0.15)", text: "#34d399", border: "rgba(16, 185, 129, 0.3)" },
  receipt_cross_validation: { bg: "rgba(45, 212, 191, 0.15)", text: "#2dd4bf", border: "rgba(45, 212, 191, 0.3)" },
  extraction_completed: { bg: "rgba(16, 185, 129, 0.15)", text: "#34d399", border: "rgba(16, 185, 129, 0.3)" },
  validation: { bg: "rgba(52, 211, 153, 0.15)", text: "#34d399", border: "rgba(52, 211, 153, 0.3)" },
  scoring: { bg: "rgba(245, 158, 11, 0.15)", text: "#fbbf24", border: "rgba(245, 158, 11, 0.3)" },
  completed: { bg: "rgba(34, 197, 94, 0.18)", text: "#4ade80", border: "rgba(34, 197, 94, 0.35)" },
  failed: { bg: "rgba(239, 68, 68, 0.18)", text: "#f87171", border: "rgba(239, 68, 68, 0.35)" },
  timeout: { bg: "rgba(239, 68, 68, 0.18)", text: "#f87171", border: "rgba(239, 68, 68, 0.35)" },
};

function getStageStyle(stage) {
  const key = String(stage || "").toLowerCase();
  return STAGE_COLORS[key] || {
    bg: "rgba(148, 163, 184, 0.15)",
    text: "#94a3b8",
    border: "rgba(148, 163, 184, 0.3)",
  };
}

function JsonCodeBlock({ data }) {
  const [copied, setCopied] = useState(false);
  const formatted = useMemo(() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [data]);

  const handleCopy = async (e) => {
    e.stopPropagation();
    const ok = await copyToClipboard(formatted);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("JSON copied to clipboard");
    }
  };

  return (
    <div
      style={{
        position: "relative",
        marginTop: 8,
        background: "#0c1322",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: 8,
        padding: "10px 14px",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 12,
        color: "#34d399",
        lineHeight: 1.5,
        overflowX: "auto",
        boxShadow: "inset 0 2px 6px rgba(0,0,0,0.3)",
      }}
    >
      <button
        onClick={handleCopy}
        title="Copy JSON"
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          background: "rgba(255, 255, 255, 0.06)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: 5,
          padding: "3px 6px",
          color: "#94a3b8",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: 10,
          transition: "all 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.12)";
          e.currentTarget.style.color = "#fff";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
          e.currentTarget.style.color = "#94a3b8";
        }}
      >
        {copied ? (
          <>
            <Check size={10} style={{ color: "#34d399" }} />
            <span style={{ color: "#34d399" }}>Copied</span>
          </>
        ) : (
          <>
            <Copy size={10} />
            <span>Copy</span>
          </>
        )}
      </button>
      <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {formatted}
      </pre>
    </div>
  );
}

export default function RequestLogsModal({ requestId, isOpen, onClose, initialFilename }) {
  const [copiedRequestId, setCopiedRequestId] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["request-logs", requestId],
    queryFn: async () => {
      if (!requestId) return null;
      const res = await axios.get(`/api/requests/${encodeURIComponent(requestId)}/logs`);
      return res.data;
    },
    enabled: !!requestId && isOpen,
    staleTime: 5000,
  });

  const handleCopyRequestId = async () => {
    const idToCopy = data?.requestId || requestId;
    if (!idToCopy) return;
    const ok = await copyToClipboard(idToCopy);
    if (ok) {
      setCopiedRequestId(true);
      setTimeout(() => setCopiedRequestId(false), 1500);
      toast.success("Request ID copied");
    }
  };

  const handleCopyAllLogs = async () => {
    if (!data?.logs?.length) {
      toast.error("No logs to copy");
      return;
    }
    const fullJson = JSON.stringify(data, null, 2);
    const ok = await copyToClipboard(fullJson);
    if (ok) {
      toast.success("Full logs copied as JSON");
    }
  };

  if (!isOpen) return null;

  const logs = data?.logs || [];
  const filename = data?.filename || initialFilename || requestId;
  const status = data?.status || (logs.length ? "COMPLETED" : "UNKNOWN");
  const isFailed = status === "FAILED" || logs.some((l) => l.level === "ERROR" || l.stage === "failed");

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        animation: "fadeIn 0.15s ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 680,
          maxHeight: "88vh",
          background: "#161e2e",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 16,
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.08)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          color: "#f1f5f9",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            background: "linear-gradient(180deg, #1b2537 0%, #161e2e 100%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: "rgba(168, 85, 247, 0.18)",
                border: "1px solid rgba(168, 85, 247, 0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#c084fc",
                flexShrink: 0,
              }}
            >
              <ScrollText size={19} />
            </div>

            <div style={{ minWidth: 0 }}>
              <h2
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: "#f8fafc",
                  margin: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={filename}
              >
                {filename}
              </h2>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 3,
                }}
              >
                <span
                  style={{
                    fontSize: 11.5,
                    fontFamily: "ui-monospace, SFMono-Regular, monospace",
                    color: "#94a3b8",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={data?.requestId || requestId}
                >
                  {data?.requestId || requestId}
                </span>
                <button
                  onClick={handleCopyRequestId}
                  title="Copy Request ID"
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: 2,
                    color: copiedRequestId ? "#34d399" : "#64748b",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {copiedRequestId ? <Check size={12} /> : <Copy size={12} />}
                </button>
              </div>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              title="Refresh logs"
              style={{
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 8,
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#94a3b8",
                cursor: isFetching ? "wait" : "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)";
                e.currentTarget.style.color = "#fff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                e.currentTarget.style.color = "#94a3b8";
              }}
            >
              <RefreshCw
                size={14}
                style={{
                  animation: isFetching ? "spin 1s linear infinite" : "none",
                }}
              />
            </button>

            <button
              onClick={handleCopyAllLogs}
              title="Copy all logs as JSON"
              style={{
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 8,
                padding: "0 10px",
                height: 32,
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 12,
                fontWeight: 500,
                color: "#94a3b8",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)";
                e.currentTarget.style.color = "#fff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                e.currentTarget.style.color = "#94a3b8";
              }}
            >
              <FileCode size={13} />
              <span>Export</span>
            </button>

            <button
              onClick={onClose}
              title="Close (Esc)"
              style={{
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 8,
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#94a3b8",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(239, 68, 68, 0.2)";
                e.currentTarget.style.color = "#ef4444";
                e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.3)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                e.currentTarget.style.color = "#94a3b8";
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Modal Body: Timeline */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          {isLoading ? (
            <div
              style={{
                padding: "60px 20px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                color: "#94a3b8",
              }}
            >
              <RefreshCw size={24} style={{ animation: "spin 1s linear infinite", color: "#a855f7" }} />
              <span style={{ fontSize: 13 }}>Loading request execution logs...</span>
            </div>
          ) : isError ? (
            <div
              style={{
                padding: "40px 20px",
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: 12,
                textAlign: "center",
                color: "#f87171",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
              }}
            >
              <AlertTriangle size={24} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>Failed to load request logs</span>
              <span style={{ fontSize: 12, color: "#fca5a5" }}>
                {error?.response?.data?.error || error?.message || "An error occurred"}
              </span>
            </div>
          ) : logs.length === 0 ? (
            <div
              style={{
                padding: "60px 20px",
                textAlign: "center",
                color: "#94a3b8",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Terminal size={32} style={{ color: "#475569" }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: "#cbd5e1" }}>
                No processing logs recorded
              </span>
              <span style={{ fontSize: 12, color: "#64748b", maxWidth: 360 }}>
                No entry was found in the processing logs table for request{" "}
                <code style={{ color: "#c084fc" }}>{requestId}</code>.
              </span>
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              {/* Vertical timeline line */}
              <div
                style={{
                  position: "absolute",
                  top: 14,
                  bottom: 14,
                  left: 11,
                  width: 2,
                  background: "rgba(255, 255, 255, 0.08)",
                  zIndex: 1,
                }}
              />

              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {logs.map((log, index) => {
                  const stageStyle = getStageStyle(log.stage);
                  const isErrorLog = log.level === "ERROR" || log.stage === "failed" || log.stage === "timeout";
                  const isSuccessLog =
                    log.stage === "completed" ||
                    log.stage === "validation" ||
                    log.stage === "extraction_completed" ||
                    log.level === "INFO";

                  return (
                    <div
                      key={log.log_id || index}
                      style={{
                        display: "flex",
                        gap: 14,
                        position: "relative",
                        zIndex: 2,
                      }}
                    >
                      {/* Status Icon */}
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          background: isErrorLog ? "#450a0a" : "#06281e",
                          border: isErrorLog
                            ? "2px solid #ef4444"
                            : "2px solid #10b981",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          marginTop: 2,
                          boxShadow: isErrorLog
                            ? "0 0 10px rgba(239, 68, 68, 0.4)"
                            : "0 0 10px rgba(16, 185, 129, 0.3)",
                        }}
                      >
                        {isErrorLog ? (
                          <XCircle size={13} style={{ color: "#ef4444" }} />
                        ) : (
                          <Check size={12} style={{ color: "#10b981", strokeWidth: 3 }} />
                        )}
                      </div>

                      {/* Content Box */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            flexWrap: "wrap",
                            marginBottom: 4,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: 6,
                              background: stageStyle.bg,
                              color: stageStyle.text,
                              border: `1px solid ${stageStyle.border}`,
                              letterSpacing: "0.03em",
                            }}
                          >
                            {formatStageName(log.stage)}
                          </span>

                          <span
                            style={{
                              fontSize: 11,
                              color: "#64748b",
                              fontFamily: "ui-monospace, SFMono-Regular, monospace",
                            }}
                          >
                            {formatTimestamp(log.created_at)}
                          </span>

                          {log.level && log.level !== "INFO" && (
                            <span
                              style={{
                                fontSize: 9.5,
                                fontWeight: 700,
                                padding: "1px 6px",
                                borderRadius: 4,
                                background: isErrorLog
                                  ? "rgba(239, 68, 68, 0.2)"
                                  : "rgba(245, 158, 11, 0.2)",
                                color: isErrorLog ? "#f87171" : "#fbbf24",
                                textTransform: "uppercase",
                              }}
                            >
                              {log.level}
                            </span>
                          )}
                        </div>

                        {/* Message description */}
                        <div
                          style={{
                            fontSize: 13,
                            color: isErrorLog ? "#fca5a5" : "#e2e8f0",
                            lineHeight: 1.5,
                            wordBreak: "break-word",
                          }}
                        >
                          {log.message}
                        </div>

                        {/* JSON details card */}
                        {log.details &&
                          typeof log.details === "object" &&
                          Object.keys(log.details).length > 0 && (
                            <JsonCodeBlock data={log.details} />
                          )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            background: "#111827",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>Final status:</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: 99,
                background: isFailed
                  ? "rgba(239, 68, 68, 0.2)"
                  : "rgba(34, 197, 94, 0.2)",
                color: isFailed ? "#f87171" : "#4ade80",
                border: isFailed
                  ? "1px solid rgba(239, 68, 68, 0.4)"
                  : "1px solid rgba(34, 197, 94, 0.4)",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              {status}
            </span>

            {logs.length > 0 && (
              <span style={{ fontSize: 11.5, color: "#64748b" }}>
                · {logs.length} step{logs.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            style={{
              padding: "7px 16px",
              borderRadius: 8,
              fontSize: 12.5,
              fontWeight: 600,
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              color: "#f8fafc",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.14)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
