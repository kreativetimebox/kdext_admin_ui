"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import toast from "react-hot-toast";
import { ArrowLeft, Database, Lock, ShieldAlert, RefreshCw } from "lucide-react";
import { useThemeStore } from "@/lib/store";
import { ISSUE_TYPES, BUG_STATUSES, ACTION_STATUSES } from "@/lib/constants";
import Navbar from "@/components/Navbar/Navbar";
import CommentsPanel from "@/components/Comments/CommentsPanel";
import FileViewer from "@/components/Viewer/FileViewer";
import DocumentMetadataPanel from "@/components/Results/DocumentMetadataPanel";
import EditableResultView, { EditHistory } from "@/components/Results/EditableResultView";
import FormattedResultView from "@/components/Results/FormattedResultView";
import OCRResults from "@/components/Results/OCRResults";
import RawResults from "@/components/Results/RawResults";
import ReprocessControl from "@/components/Reprocess/ReprocessControl";

function BugTrackingPanel({ docId, doc, onSaved, onCommentsChanged }) {
  const [issueType, setIssueType] = useState(doc?.issue_type || "");
  const [issueDescription, setIssueDescription] = useState(doc?.issue_description || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setIssueType(doc?.issue_type || "");
    setIssueDescription(doc?.issue_description || "");
  }, [doc?.issue_type, doc?.issue_description]);

  async function save(patch) {
    setSaving(true);
    try {
      const res = await axios.post(`/api/document/${docId}/update-bug-tracking`, patch);
      if (res.data?.ok === false) {
        toast.error(res.data.error || "Failed to save");
        return false;
      }
      onSaved(res.data);
      toast.success("Saved");
      return true;
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to save");
      return false;
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-bold uppercase tracking-widest px-0.5" style={{ color: "var(--section-title)" }}>
        Bug Tracking
      </p>
      <div className="flex flex-col gap-4 p-4 rounded-lg border" style={{ borderColor: "var(--panel-border)", background: "var(--panel-bg)" }}>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Issue Type
          </label>
          <select
            value={issueType}
            disabled={saving}
            onChange={async (e) => {
              const val = e.target.value;
              setIssueType(val);
              // This only saves the draft issue_type -- the row doesn't
              // become a tracked bug (bug_flagged_at/bug_tracker_id) until
              // Publish is clicked below, so stay on this page rather than
              // jumping to the Bug Tracker.
              await save({ issueType: val || null });
            }}
            className="text-sm px-2 py-1.5 rounded border"
            style={{ borderColor: "var(--input-border)", background: "var(--input-bg)", color: "var(--foreground)" }}
          >
            <option value="">—</option>
            {ISSUE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Issue Description
          </label>
          <textarea
            value={issueDescription}
            disabled={saving}
            onChange={(e) => setIssueDescription(e.target.value)}
            onBlur={() => {
              if (issueDescription !== (doc?.issue_description || "")) {
                save({ issueDescription: issueDescription || null });
              }
            }}
            rows={2}
            className="text-sm px-2 py-1.5 rounded border resize-y"
            style={{ borderColor: "var(--input-border)", background: "var(--input-bg)", color: "var(--foreground)" }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Bug Status
          </label>
          <select
            value={doc?.bug_status || ""}
            disabled={saving}
            onChange={(e) => save({ bugStatus: e.target.value })}
            className="text-sm px-2 py-1.5 rounded border"
            style={{ borderColor: "var(--input-border)", background: "var(--input-bg)", color: "var(--foreground)" }}
          >
            <option value="" disabled>—</option>
            {BUG_STATUSES.map((s) => (
              <option key={s} value={s}>{s === "TO_BE_TESTED" ? "To Be Tested" : s}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Action Status
          </label>
          <select
            value={doc?.action_status || ""}
            disabled={saving}
            onChange={(e) => save({ actionStatus: e.target.value || null })}
            className="text-sm px-2 py-1.5 rounded border"
            style={{ borderColor: "var(--input-border)", background: "var(--input-bg)", color: "var(--foreground)" }}
          >
            <option value="">— None —</option>
            {ACTION_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <CommentsPanel
          resultId={docId}
          comments={doc?.comments || []}
          onCommentsChanged={onCommentsChanged}
          height={240}
        />
      </div>
    </div>
  );
}

export default function ViewDocumentPage() {
  const { id } = useParams();
  const router = useRouter();
  const { initTheme } = useThemeStore();
  const queryClient = useQueryClient();

  // Result tabs: "hitl" = editable HITL-updated copy, "original" = read-only
  // original extraction (formatted_result).
  const [resultTab, setResultTab] = useState("hitl");
  const [lockState, setLockState] = useState({ status: "checking", lockedBy: null });
  const tabIdRef = useRef(null);

  if (!tabIdRef.current) {
    tabIdRef.current = "tab_" + Math.random().toString(36).slice(2) + "_" + Date.now();
  }

  useEffect(() => { initTheme(); }, [initTheme]);

  // Acquire document lock on mount, send periodic heartbeats, release on exit.
  useEffect(() => {
    if (!id) return;

    let heartbeatTimer = null;
    let isMounted = true;
    const tabId = tabIdRef.current;

    async function acquireLock() {
      try {
        const res = await axios.post(`/api/document/${encodeURIComponent(id)}/lock`, {
          action: "acquire",
          tabId,
        });
        if (!isMounted) return;
        if (res.data?.success) {
          setLockState({ status: "acquired", lockedBy: null });
          heartbeatTimer = setInterval(() => {
            axios
              .post(`/api/document/${encodeURIComponent(id)}/lock`, { action: "heartbeat", tabId })
              .then((hb) => {
                if (hb.data && !hb.data.success && isMounted) {
                  setLockState({ status: "blocked", lockedBy: hb.data.lockedBy || null });
                }
              })
              .catch(() => {});
          }, 3000);
        } else {
          setLockState({ status: "blocked", lockedBy: res.data?.lockedBy || null });
        }
      } catch (err) {
        if (!isMounted) return;
        setLockState({ status: "acquired", lockedBy: null });
      }
    }

    acquireLock();

    const releaseLockNow = () => {
      try {
        navigator.sendBeacon(
          `/api/document/${encodeURIComponent(id)}/lock`,
          new Blob([JSON.stringify({ action: "release", tabId })], { type: "application/json" })
        );
      } catch {}
      axios.post(`/api/document/${encodeURIComponent(id)}/lock`, { action: "release", tabId }).catch(() => {});
    };

    window.addEventListener("beforeunload", releaseLockNow);
    window.addEventListener("pagehide", releaseLockNow);

    return () => {
      isMounted = false;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      window.removeEventListener("beforeunload", releaseLockNow);
      window.removeEventListener("pagehide", releaseLockNow);
      releaseLockNow();
    };
  }, [id]);

  const { data: doc, isLoading } = useQuery({
    queryKey: ["document", id],
    queryFn: async () => {
      const res = await axios.get(`/api/document/${id}`);
      return res.data;
    },
    enabled: !!id && lockState.status !== "blocked",
    staleTime: 30 * 60 * 1000,
    onError: () => toast.error("Failed to load document"),
  });

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--background)" }}>
      <Navbar />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <main className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">

          {/* Back bar */}
          <div
            className="flex items-center gap-3 px-5 py-3 shrink-0 border-b"
            style={{ borderColor: "var(--panel-border)", background: "var(--panel-bg)" }}
          >
            <button
              onClick={() => router.back()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                border: "1px solid var(--panel-border)",
                background: "var(--input-bg)",
                color: "var(--foreground)",
                cursor: "pointer",
              }}
            >
              <ArrowLeft size={14} />
              Back
            </button>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Document
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--accent)",
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
              }}
            >
              {id}
            </span>
            {doc?.ocr_document_type && (
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "var(--tag-bg)", color: "var(--tag-color)" }}
              >
                {doc.ocr_document_type}
              </span>
            )}
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase"
              style={{ background: "var(--tag-purple-bg)", color: "var(--tag-purple-color)" }}
              title="Environment"
            >
              {doc?.key_environment || "production"}
            </span>
          </div>

          {lockState.status === "blocked" ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 text-center" style={{ background: "var(--background)" }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "rgba(239, 68, 68, 0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ef4444",
                }}
              >
                <Lock size={32} />
              </div>
              <div style={{ maxWidth: 460 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--foreground)", marginBottom: 8 }}>
                  Document In Use
                </h2>
                <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.6 }}>
                  This document (<span style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--accent)" }}>{id}</span>) is currently open and being reviewed by{" "}
                  <strong style={{ color: "var(--foreground)" }}>
                    {lockState.lockedBy?.userEmail || lockState.lockedBy?.userName || "another reviewer"}
                  </strong>.
                </p>
                <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 8 }}>
                  To prevent conflicting edits, only one reviewer can open a document at a time.
                </p>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => router.back()}
                  style={{
                    padding: "9px 20px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    border: "1px solid var(--panel-border)",
                    background: "var(--input-bg)",
                    color: "var(--foreground)",
                    cursor: "pointer",
                  }}
                >
                  Go Back
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setLockState({ status: "checking", lockedBy: null });
                    try {
                      const res = await axios.post(`/api/document/${encodeURIComponent(id)}/lock`, {
                        action: "acquire",
                        tabId: tabIdRef.current,
                      });
                      if (res.data?.success) {
                        setLockState({ status: "acquired", lockedBy: null });
                        toast.success("Document lock acquired");
                      } else {
                        setLockState({ status: "blocked", lockedBy: res.data?.lockedBy || null });
                        toast.error("Document is still in use");
                      }
                    } catch {
                      setLockState({ status: "blocked", lockedBy: null });
                    }
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "9px 20px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    border: "none",
                    background: "var(--accent)",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  <RefreshCw size={14} /> Retry Access
                </button>
              </div>
            </div>
          ) : isLoading || lockState.status === "checking" ? (
            <div className="flex-1 flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
              Loading document...
            </div>
          ) : !doc ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 pb-16">
              <Database size={28} style={{ color: "var(--text-muted)" }} />
              <p style={{ color: "var(--text-muted)" }}>Document not found</p>
            </div>
          ) : (
            <>
              {/* Each column scrolls independently — this row is height-bound
                  (flex-1 min-h-0) so the two overflow-y-auto columns below can
                  actually clip and scroll on their own instead of growing to
                  their content height and leaving `main` as the only scroller. */}
              <div className="flex flex-1 min-h-0 min-w-0">
                {/* File Viewer */}
                <div
                  className="w-[460px] shrink-0 flex flex-col overflow-hidden border-r"
                  style={{ borderColor: "var(--panel-border)", background: "var(--panel-bg)" }}
                >
                  <div
                    className="flex items-center justify-between px-4 py-2.5 shrink-0 border-b"
                    style={{ borderColor: "var(--panel-border)" }}
                  >
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                      File Viewer
                    </h2>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    <FileViewer
                    document={doc}
                    isLoading={isLoading}
                    onRefresh={() => queryClient.invalidateQueries({ queryKey: ["document", id] })}
                  />
                    <div className="p-4 border-t" style={{ borderColor: "var(--panel-border)" }}>
                      <DocumentMetadataPanel doc={doc} documentType={doc?.ocr_document_type} />
                    </div>
                    <div className="p-4 border-t" style={{ borderColor: "var(--panel-border)" }}>
                      <BugTrackingPanel
                        docId={id}
                        doc={doc}
                        onSaved={(res) => {
                          // The route's RETURNING clause always reflects the
                          // current row, including fields cleared to null, so
                          // these can be assigned directly (no ?? fallback).
                          queryClient.setQueryData(["document", id], (prev) =>
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
                          queryClient.setQueryData(["document", id], (prev) =>
                            prev ? { ...prev, comments: updated } : prev
                          );
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Data panel — its own scroll container, independent of the File Viewer column */}
                <div className="flex-1 min-w-0 min-h-0 overflow-y-auto p-8 flex flex-col gap-8">
                  {/* Reprocess: re-run the pipeline and overwrite this result in
                      place (keeps the original request_id). */}
                  <ReprocessControl
                    docId={id}
                    currentType={doc?.ocr_document_type}
                    queryKey={["document", id]}
                  />

                  {/* Tabs: HITL Updated (editable) vs Original Result (read-only) */}
                  <div className="flex items-center gap-2">
                    {[
                      { key: "hitl", label: "HITL Updated" },
                      { key: "original", label: "Original Result" },
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

                  {resultTab === "hitl" ? (
                    <>
                      <EditableResultView
                        resultId={id}
                        requestId={doc?.request_id}
                        data={doc?.validation === false ? doc?.ocr_ui_results : doc?.hitl_updated_result}
                        onSaved={(res) => {
                          if (res?.hitl_updated_result !== undefined) {
                            queryClient.setQueryData(["document", id], (prev) =>
                              prev
                                ? {
                                    ...prev,
                                    hitl_updated_result: res.hitl_updated_result,
                                    // A successful HITL save flips validation=true
                                    // server-side; mirror it so the "HITL Updated
                                    // Result (JSON)" panel (gated on validation)
                                    // renders the saved result instead of the original.
                                    validation: true,
                                  }
                                : prev
                            );
                          }
                          // Publish also flips hitl_status server-side (see
                          // lib/queries.js's updateHitlResult) and may have
                          // changed other fields the metadata panel shows —
                          // the setQueryData patch above only covers the two
                          // fields this component itself knows about, so
                          // refetch to pick up everything else.
                          queryClient.invalidateQueries({ queryKey: ["document", id] });
                        }}
                      />

                      <div className="flex flex-col gap-3">
                        <p className="text-xs font-bold uppercase tracking-widest px-0.5" style={{ color: "var(--section-title)" }}>
                          HITL Updated Result (JSON)
                        </p>
                        <OCRResults data={doc?.validation === false ? doc?.ocr_ui_results : doc?.hitl_updated_result} />
                      </div>

                      <EditHistory data={doc?.hitl_updated_result} />
                    </>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <p className="text-xs font-bold uppercase tracking-widest px-0.5" style={{ color: "var(--section-title)" }}>
                        Original Result (Formatted)
                      </p>
                      <FormattedResultView data={doc?.ocr_ui_results} title="OCR Results" requestId={doc?.request_id} />
                      <OCRResults data={doc?.ocr_ui_results} />
                    </div>
                  )}

                  <div className="flex flex-col gap-3">
                    <p className="text-xs font-bold uppercase tracking-widest px-0.5" style={{ color: "var(--section-title)" }}>
                      Raw Results
                    </p>
                    <RawResults ocrRaw={doc?.ocr_raw_results} />
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
