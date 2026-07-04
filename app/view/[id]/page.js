"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import toast from "react-hot-toast";
import { ArrowLeft, Database } from "lucide-react";
import { useThemeStore } from "@/lib/store";
import Navbar from "@/components/Navbar/Navbar";
import FileViewer from "@/components/Viewer/FileViewer";
import EditableResultView, { EditHistory } from "@/components/Results/EditableResultView";
import FormattedResultView from "@/components/Results/FormattedResultView";
import OCRResults from "@/components/Results/OCRResults";
import RawResults from "@/components/Results/RawResults";
import ReprocessControl from "@/components/Reprocess/ReprocessControl";

export default function ViewDocumentPage() {
  const { id } = useParams();
  const router = useRouter();
  const { initTheme } = useThemeStore();
  const queryClient = useQueryClient();

  // Result tabs: "hitl" = editable HITL-updated copy, "original" = read-only
  // original extraction (formatted_result).
  const [resultTab, setResultTab] = useState("hitl");

  useEffect(() => { initTheme(); }, [initTheme]);

  const { data: doc, isLoading } = useQuery({
    queryKey: ["document", id],
    queryFn: async () => {
      const res = await axios.get(`/api/document/${id}`);
      return res.data;
    },
    enabled: !!id,
    staleTime: 30 * 60 * 1000,
    onError: () => toast.error("Failed to load document"),
  });

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--background)" }}>
      <Navbar />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <main className="flex-1 min-h-0 min-w-0 flex flex-col overflow-y-auto">

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
          </div>

          {isLoading ? (
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
              <div className="flex min-w-0">
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
                  </div>
                </div>

                {/* Data panel */}
                <div className="flex-1 min-w-0 p-8 flex flex-col gap-8">
                  {/* Reprocess: re-run the pipeline and overwrite this result in
                      place (keeps the original request_id). */}
                  <ReprocessControl
                    docId={id}
                    currentType={doc?.ocr_document_type}
                    onReprocessed={() =>
                      queryClient.invalidateQueries({ queryKey: ["document", id] })
                    }
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
                        data={doc?.validation === true ? doc?.hitl_updated_result : doc?.ocr_ui_results}
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
                        }}
                      />

                      <div className="flex flex-col gap-3">
                        <p className="text-xs font-bold uppercase tracking-widest px-0.5" style={{ color: "var(--section-title)" }}>
                          HITL Updated Result (JSON)
                        </p>
                        <OCRResults data={doc?.validation === true ? doc?.hitl_updated_result : doc?.ocr_ui_results} />
                      </div>

                      <EditHistory data={doc?.hitl_updated_result} />
                    </>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <p className="text-xs font-bold uppercase tracking-widest px-0.5" style={{ color: "var(--section-title)" }}>
                        Original Result (Formatted)
                      </p>
                      <FormattedResultView data={doc?.ocr_ui_results} title="OCR Results" />
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
