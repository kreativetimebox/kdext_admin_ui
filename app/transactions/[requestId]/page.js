"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  AlertCircle,
  ImageOff,
  Hash,
  Copy,
  Check,
  Receipt,
  ExternalLink,
} from "lucide-react";
import { useThemeStore } from "@/lib/store";
import Navbar from "@/components/Navbar/Navbar";
import JsonPanel from "@/components/Results/JsonPanel";

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
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
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
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

function TransactionImage({ url, originalFilename, documentPath }) {
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
        <p style={{ fontSize: 12 }}>Image failed to load</p>
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
          height: 520,
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
          maxHeight: 600,
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

export default function TransactionDetailPage({ params }) {
  const { requestId } = use(params);
  const { initTheme } = useThemeStore();
  const router = useRouter();

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["transaction", requestId],
    queryFn: async () => {
      const res = await axios.get(`/api/transactions/${encodeURIComponent(requestId)}`);
      return res.data;
    },
    enabled: !!requestId,
    staleTime: 2 * 60 * 1000,
    onError: () => toast.error("Failed to load transaction"),
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--background)" }}>
      <Navbar />

      <main style={{ flex: 1, padding: "32px 40px", maxWidth: 1500, margin: "0 auto", width: "100%" }}>
        {/* Back + header */}
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={() => router.push("/transactions")}
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
            Back to transactions
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: "linear-gradient(135deg, #0891b2 0%, #2563eb 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Receipt size={20} color="#fff" />
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
                  {data?.transaction_id || requestId}
                </span>
              </h1>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                Detailed view of processing request and formatted result.
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
            Loading transaction...
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
            <p>Failed to load transaction</p>
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
            <p>Transaction not found</p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(320px, 420px) 1fr",
              gap: 20,
            }}
          >
            {/* Left: image + metadata */}
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
                <TransactionImage
                  url={data.signed_url}
                  originalFilename={data.original_filename}
                  documentPath={data.document_path}
                />
                {data.signed_url && (
                  <a
                    href={data.signed_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      marginTop: 10,
                      fontSize: 12,
                      color: "var(--accent)",
                      textDecoration: "none",
                    }}
                  >
                    <ExternalLink size={11} />
                    Open file in new tab
                  </a>
                )}
              </div>

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

                <MetaRow label="Transaction ID" mono>
                  <span>{data.transaction_id}</span>
                  <CopyButton value={data.transaction_id} label="transaction_id" />
                </MetaRow>
                <MetaRow label="Request ID" mono>
                  <span>{data.request_id}</span>
                  <CopyButton value={data.request_id} label="request_id" />
                </MetaRow>
                <MetaRow label="Document Type">
                  {data.document_type ? (
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
                      {data.document_type}
                    </span>
                  ) : (
                    "—"
                  )}
                </MetaRow>
                <MetaRow label="Original File" mono>
                  {data.original_filename || "—"}
                </MetaRow>
                <MetaRow label="Submitted">{formatDate(data.submitted_at)}</MetaRow>
                <MetaRow label="Completed">{formatDate(data.completed_at)}</MetaRow>
                {data.processing_duration_ms != null && (
                  <MetaRow label="Duration">{data.processing_duration_ms} ms</MetaRow>
                )}
                {data.error_message && (
                  <MetaRow label="Error">
                    <span style={{ color: "#ef4444" }}>{data.error_message}</span>
                  </MetaRow>
                )}
              </div>
            </div>

            {/* Right: results */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
              <JsonPanel
                title="Formatted Result"
                data={data.formatted_result}
                defaultOpen
                variant="green"
              />
              <JsonPanel
                title="Processing Result"
                data={data.processing_result}
                variant="blue"
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
