"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  AlertCircle,
  ImageOff,
  Hash,
  Copy,
  Check,
  FileText,
  ExternalLink,
  Download,
  User as UserIcon,
  Clock,
  Calendar,
} from "lucide-react";
import { useThemeStore } from "@/lib/store";
import { ISSUE_TYPES, BUG_STATUSES } from "@/lib/constants";
import { copyToClipboard } from "@/lib/clipboard";
import Navbar from "@/components/Navbar/Navbar";
import CommentsPanel from "@/components/Comments/CommentsPanel";
import JsonPanel from "@/components/Results/JsonPanel";
import FormattedResultView from "@/components/Results/FormattedResultView";
import ReprocessControl from "@/components/Reprocess/ReprocessControl";
import DocumentMetadataPanel from "@/components/Results/DocumentMetadataPanel";

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

function isImagePath(path) {
  if (!path) return false;
  try {
    const url = new URL(path);
    return /\.(png|jpg|jpeg|gif|webp|bmp|tiff?)$/i.test(url.pathname);
  } catch {
    return /\.(png|jpg|jpeg|gif|webp|bmp|tiff?)(\?|$)/i.test(path);
  }
}

function isPdfPath(path) {
  if (!path) return false;
  try {
    const url = new URL(path);
    return /\.pdf$/i.test(url.pathname);
  } catch {
    return /\.pdf(\?|$)/i.test(path);
  }
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

function StatusBadge({ status }) {
  const colors = {
    COMPLETED: { bg: "var(--tag-green-bg)", color: "var(--tag-green-color)" },
    FAILED: { bg: "#fee2e2", color: "#b91c1c" },
    PENDING: { bg: "var(--tag-amber-bg)", color: "var(--tag-amber-color)" },
    PROCESSING: { bg: "var(--tag-bg)", color: "var(--accent)" },
  };
  const c = colors[status] || { bg: "var(--input-bg)", color: "var(--text-muted)" };
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: "0.05em",
        padding: "3px 8px",
        borderRadius: 99,
        background: c.bg,
        color: c.color,
      }}
    >
      {status || "UNKNOWN"}
    </span>
  );
}

function BugTrackingPanel({ resultId, data, onSaved, onCommentsChanged }) {
  const [issueType, setIssueType] = useState(data?.issue_type || "");
  const [issueDescription, setIssueDescription] = useState(data?.issue_description || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setIssueType(data?.issue_type || "");
    setIssueDescription(data?.issue_description || "");
  }, [data?.issue_type, data?.issue_description]);

  async function save(patch) {
    if (!resultId) {
      toast.error("This document has no result_id yet — bug tracking isn't available until processing completes");
      return;
    }
    setSaving(true);
    try {
      const res = await axios.post(`/api/document/${encodeURIComponent(resultId)}/update-bug-tracking`, patch);
      if (res.data?.ok === false) {
        toast.error(res.data.error || "Failed to save");
        return;
      }
      onSaved(res.data);
      toast.success("Saved");
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const fieldStyle = {
    fontSize: 13,
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid var(--input-border)",
    background: "var(--input-bg)",
    color: "var(--foreground)",
    width: "100%",
  };

  return (
    <div
      style={{
        background: "var(--panel-bg)",
        border: "1px solid var(--panel-border)",
        borderRadius: 12,
        padding: "12px 16px 16px",
        boxShadow: "var(--shadow-sm)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <h3
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-muted)",
          margin: 0,
        }}
      >
        Bug Tracking
      </h3>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Issue Type
        </label>
        <select
          value={issueType}
          disabled={saving}
          onChange={(e) => {
            const val = e.target.value;
            setIssueType(val);
            save({ issueType: val || null });
          }}
          style={fieldStyle}
        >
          <option value="">—</option>
          {ISSUE_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Issue Description
        </label>
        <textarea
          value={issueDescription}
          disabled={saving}
          onChange={(e) => setIssueDescription(e.target.value)}
          onBlur={() => {
            if (issueDescription !== (data?.issue_description || "")) {
              save({ issueDescription: issueDescription || null });
            }
          }}
          rows={2}
          style={{ ...fieldStyle, resize: "vertical" }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Bug Status
        </label>
        <select
          value={data?.bug_status || ""}
          disabled={saving}
          onChange={(e) => save({ bugStatus: e.target.value })}
          style={fieldStyle}
        >
          <option value="" disabled>—</option>
          {BUG_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <CommentsPanel
        resultId={resultId}
        comments={data?.comments || []}
        onCommentsChanged={onCommentsChanged}
        height={240}
      />
    </div>
  );
}

function FileRender({ url, originalFilename, documentPath }) {
  const [errored, setErrored] = useState(false);

  const isImage = isImagePath(documentPath) || isImagePath(originalFilename || "");
  const isPdf = isPdfPath(documentPath) || isPdfPath(originalFilename || "");

  if (!url) {
    return (
      <div
        style={{
          width: "100%",
          aspectRatio: "3 / 4",
          borderRadius: 10,
          background: "var(--input-bg)",
          border: "1px dashed var(--panel-border)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          color: "var(--text-muted)",
        }}
      >
        <ImageOff size={28} />
        <p style={{ fontSize: 12 }}>File unavailable</p>
      </div>
    );
  }

  if (errored) {
    return (
      <div
        style={{
          width: "100%",
          aspectRatio: "3 / 4",
          borderRadius: 10,
          background: "var(--input-bg)",
          border: "1px dashed var(--panel-border)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          color: "var(--text-muted)",
          padding: 12,
          textAlign: "center",
        }}
      >
        <AlertCircle size={26} style={{ color: "#f59e0b" }} />
        <p style={{ fontSize: 12 }}>Failed to load</p>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 11, color: "var(--accent)", textDecoration: "underline" }}
        >
          Open original
        </a>
      </div>
    );
  }

  if (isPdf) {
    return (
      <iframe
        src={url}
        title={originalFilename || "document"}
        style={{
          width: "100%",
          height: 620,
          borderRadius: 10,
          border: "1px solid var(--panel-border)",
          background: "var(--input-bg)",
        }}
      />
    );
  }

  if (isImage) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={url}
        alt={originalFilename || "document"}
        onError={() => setErrored(true)}
        style={{
          width: "100%",
          maxHeight: 620,
          objectFit: "contain",
          borderRadius: 10,
          background: "var(--input-bg)",
          border: "1px solid var(--panel-border)",
        }}
      />
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        aspectRatio: "3 / 4",
        borderRadius: 10,
        background: "var(--input-bg)",
        border: "1px solid var(--panel-border)",
        color: "var(--accent)",
        textDecoration: "underline",
        fontSize: 13,
      }}
    >
      Open file
    </a>
  );
}

function SummaryStat({ label, value, icon: Icon, color }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 10,
        background: "var(--panel-bg)",
        border: "1px solid var(--panel-border)",
        minWidth: 0,
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `${color}18`,
          border: `1px solid ${color}30`,
          flexShrink: 0,
        }}
      >
        <Icon size={14} style={{ color }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--foreground)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={String(value)}
        >
          {value}
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}

export default function DexaiResultPage({ params }) {
  const { requestId } = use(params);
  const { initTheme } = useThemeStore();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Result tabs: "original" = formatted_result, "hitl" = hitl_updated_result.
  const [resultTab, setResultTab] = useState("original");

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["dexai", "result", requestId],
    queryFn: async () => {
      const res = await axios.get(
        `/api/dexai/result/${encodeURIComponent(requestId)}`
      );
      return res.data;
    },
    enabled: !!requestId,
    staleTime: 5 * 60 * 1000,
    onError: () => toast.error("Failed to load result"),
  });

  const userFullName = (() => {
    const u = data?.user;
    if (!u) return "—";
    const parts = [u.first_name, u.last_name].filter(Boolean);
    return parts.length ? parts.join(" ") : u.email || "—";
  })();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "var(--background)",
      }}
    >
      <Navbar />

      <main
        style={{
          flex: 1,
          padding: "32px 40px",
          maxWidth: 1600,
          margin: "0 auto",
          width: "100%",
        }}
      >
        {/* Back + header */}
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={() => {
              if (data?.user_id) {
                router.push(`/dexai/${data.user_id}`);
              } else {
                router.push("/dexai");
              }
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 500,
              border: "1px solid var(--panel-border)",
              background: "var(--input-bg)",
              color: "var(--text-muted)",
              cursor: "pointer",
              marginBottom: 16,
            }}
          >
            <ArrowLeft size={13} />
            Back to user results
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: "var(--brand-gradient)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FileText size={20} color="#fff" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: "var(--foreground)",
                  margin: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Hash size={18} style={{ color: "var(--accent)" }} />
                <span
                  style={{
                    fontFamily: "ui-monospace, SFMono-Regular, monospace",
                    wordBreak: "break-all",
                  }}
                >
                  {data?.request_id || requestId}
                </span>
                <CopyButton value={data?.request_id || requestId} label="request_id" />
              </h1>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                Document file, formatted result, and full processing payload.
              </p>
            </div>
            {data?.status && <StatusBadge status={data.status} />}
          </div>
        </div>

        {/* Body */}
        {isLoading ? (
          <div
            style={{
              padding: 60,
              textAlign: "center",
              color: "var(--text-muted)",
              background: "var(--panel-bg)",
              border: "1px solid var(--panel-border)",
              borderRadius: 12,
            }}
          >
            Loading result...
          </div>
        ) : error ? (
          <div
            style={{
              padding: 60,
              textAlign: "center",
              color: "#ef4444",
              background: "var(--panel-bg)",
              border: "1px solid var(--panel-border)",
              borderRadius: 12,
            }}
          >
            <AlertCircle size={32} style={{ marginBottom: 12 }} />
            <p>Failed to load result</p>
          </div>
        ) : !data ? (
          <div
            style={{
              padding: 60,
              textAlign: "center",
              color: "var(--text-muted)",
              background: "var(--panel-bg)",
              border: "1px solid var(--panel-border)",
              borderRadius: 12,
            }}
          >
            <p>Result not found</p>
          </div>
        ) : (
          <>
            {/* Quick summary */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 12,
                marginBottom: 20,
              }}
            >
              <SummaryStat
                icon={UserIcon}
                color="#ff6d8e"
                label="User"
                value={userFullName}
              />
              <SummaryStat
                icon={FileText}
                color="#c985ff"
                label="Document Type"
                value={data.document_type || "—"}
              />
              <SummaryStat
                icon={Clock}
                color="#059669"
                label="Processing Time"
                value={formatDuration(data.processing_duration_ms)}
              />
              <SummaryStat
                icon={Calendar}
                color="#8fb0ff"
                label="Submitted"
                value={formatDate(data.submitted_at)}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(360px, 460px) 1fr",
                gap: 20,
              }}
            >
              {/* Left: file + metadata */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div
                  style={{
                    background: "var(--panel-bg)",
                    border: "1px solid var(--panel-border)",
                    borderRadius: 12,
                    padding: 16,
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  <FileRender
                    url={data.signed_url}
                    originalFilename={data.original_filename}
                    documentPath={data.document_path}
                  />
                  {data.signed_url && (
                    <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                      <a
                        href={data.signed_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 12,
                          color: "var(--accent)",
                          textDecoration: "none",
                        }}
                      >
                        <ExternalLink size={11} />
                        Open in new tab
                      </a>
                      <a
                        href={data.signed_url}
                        download={data.original_filename || undefined}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 12,
                          color: "var(--text-muted)",
                          textDecoration: "none",
                        }}
                      >
                        <Download size={11} />
                        Download
                      </a>
                    </div>
                  )}
                </div>

                <DocumentMetadataPanel doc={data} documentType={data.document_type} />

                <BugTrackingPanel
                  resultId={data.result_id}
                  data={data}
                  onSaved={(res) => {
                    // The route's RETURNING clause always reflects the
                    // current row, including fields cleared to null, so
                    // these can be assigned directly (no ?? fallback).
                    queryClient.setQueryData(["dexai", "result", requestId], (prev) =>
                      prev
                        ? {
                            ...prev,
                            issue_type: res.issue_type,
                            issue_description: res.issue_description,
                            bug_status: res.bug_status,
                          }
                        : prev
                    );
                  }}
                  onCommentsChanged={(updated) => {
                    queryClient.setQueryData(["dexai", "result", requestId], (prev) =>
                      prev ? { ...prev, comments: updated } : prev
                    );
                  }}
                />
              </div>

              {/* Right: results */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                  minWidth: 0,
                }}
              >
                {/* Reprocess: re-run the pipeline and overwrite this result in
                    place (keeps the original request_id). */}
                <ReprocessControl
                  docId={data.request_id || requestId}
                  currentType={data.document_type}
                  queryKey={["dexai", "result", requestId]}
                />

                {/* Tabs: Original Result vs HITL Updated (both read-only) */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {[
                    { key: "original", label: "Original Result" },
                    { key: "hitl", label: "HITL Updated" },
                  ].map((t) => {
                    const active = resultTab === t.key;
                    return (
                      <button
                        key={t.key}
                        onClick={() => setResultTab(t.key)}
                        style={{
                          padding: "8px 16px",
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                          border: "1px solid var(--panel-border)",
                          background: active ? "var(--brand-gradient)" : "var(--input-bg)",
                          color: active ? "#fff" : "var(--foreground)",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>

                {resultTab === "original" ? (
                  <>
                    <FormattedResultView
                      data={data.formatted_result}
                      title="OCR Results"
                      requestId={data.request_id}
                    />
                    <JsonPanel
                      title="Formatted Result (JSON)"
                      data={data.formatted_result}
                      variant="green"
                    />
                  </>
                ) : data.hitl_updated_result ? (
                  <>
                    <FormattedResultView
                      data={data.hitl_updated_result}
                      title="HITL Updated Result"
                      requestId={data.request_id}
                    />
                    <JsonPanel
                      title="HITL Updated Result (JSON)"
                      data={data.hitl_updated_result}
                      variant="green"
                    />
                  </>
                ) : (
                  <div
                    style={{
                      padding: "24px 16px",
                      borderRadius: 12,
                      border: "1px dashed var(--panel-border)",
                      background: "var(--input-bg)",
                      color: "var(--text-muted)",
                      fontSize: 13,
                      textAlign: "center",
                    }}
                  >
                    No HITL-updated result yet — this document has not been edited.
                  </div>
                )}

                <JsonPanel
                  title="Processing Result"
                  data={data.processing_result}
                  variant="blue"
                />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
