"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import toast from "react-hot-toast";
import { Database } from "lucide-react";
import { useDocumentStore, useThemeStore } from "@/lib/store";
import Navbar from "@/components/Navbar/Navbar";
import SidebarList from "@/components/Sidebar/SidebarList";
import FileViewer from "@/components/Viewer/FileViewer";
import EditableFields from "@/components/Forms/EditableFields";
import TextractResults from "@/components/Results/TextractResults";
import OCRResults from "@/components/Results/OCRResults";
import RawResults from "@/components/Results/RawResults";

/* ── Reusable section card ────────────────────────────────── */
function Card({ title, badge, children }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--panel-bg)",
        border: "1px solid var(--panel-border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {title && (
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b"
          style={{ borderColor: "var(--panel-border)" }}
        >
          <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            {title}
          </h2>
          {badge && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: "var(--tag-bg)", color: "var(--tag-color)" }}
            >
              {badge}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

/* ── Skeleton loader ──────────────────────────────────────── */
function DocumentSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="p-4 space-y-3">
          <div className="skeleton h-3 w-28 rounded" />
          <div className="skeleton h-52 w-full rounded-lg" />
        </div>
      </Card>
      <Card>
        <div className="p-4 space-y-3">
          <div className="skeleton h-3 w-36 rounded" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="skeleton h-4 w-28 rounded" />
              <div className="skeleton h-9 flex-1 rounded-lg" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────── */
function AnalyzerContent() {
  const { activeId, setDocument } = useDocumentStore();
  const { initTheme } = useThemeStore();
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focusId");

  useEffect(() => { initTheme(); }, [initTheme]);

  const { data: doc, isLoading } = useQuery({
    queryKey: ["document", activeId],
    queryFn: async () => {
      const res = await axios.get(`/api/document/${activeId}`);
      return res.data;
    },
    enabled: !!activeId,
    staleTime: 5 * 60 * 1000,
    onSuccess: (data) => setDocument(data),
    onError: () => toast.error("Failed to load document"),
  });

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--background)" }}>

      {/* ── Header ── */}
      <Navbar />

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Sidebar */}
        <aside
          className="w-72 shrink-0 flex flex-col overflow-hidden"
          style={{
            background: "var(--sidebar-bg)",
            borderRight: "1px solid var(--panel-border)",
          }}
        >
          <SidebarList onlyId={focusId} />
        </aside>

        {/* Right panel */}
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {isLoading && activeId ? (
            <div className="flex-1 min-h-0 overflow-y-scroll p-5"><DocumentSkeleton /></div>
          ) : !activeId ? (
            /* ── Empty / welcome state ── */
            <div className="flex-1 flex flex-col items-center justify-center gap-4 pb-16">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, var(--tag-bg) 0%, var(--active-row) 100%)",
                  border: "1px solid var(--panel-border)",
                }}
              >
                <Database size={28} style={{ color: "var(--accent)" }} />
              </div>
              <div className="text-center">
                <p className="text-base font-semibold" style={{ color: "var(--foreground)" }}>Select a document</p>
                <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                  Click any row in the sidebar to view its OCR and Textract results
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 min-h-0 overflow-hidden">

              {/* ── Left: File Viewer panel ── */}
              <div
                className="w-[800px] shrink-0 flex flex-col overflow-hidden border-r"
                style={{ borderColor: "var(--panel-border)", background: "var(--panel-bg)" }}
              >
                {/* panel header */}
                <div
                  className="flex items-center justify-between px-4 py-2.5 shrink-0 border-b"
                  style={{ borderColor: "var(--panel-border)" }}
                >
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                    File Viewer
                  </h2>
                  {doc?.ocr_document_type && (
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: "var(--tag-bg)", color: "var(--tag-color)" }}
                    >
                      {doc.ocr_document_type}
                    </span>
                  )}
                </div>
                {/* scrollable file content */}
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <FileViewer document={doc} isLoading={isLoading} />
                </div>
              </div>

              {/* ── Right: Data panel ── */}
              <div
                className="flex-1 min-h-0"
                style={{ overflowY: "scroll", scrollbarGutter: "stable" }}
              >
                <div className="p-8 flex flex-col gap-8">

                {/* Edit Fields */}
                <Card title="Edit Fields" accent="var(--accent)">
                  <EditableFields document={doc} isLoading={isLoading} />
                </Card>

                {/* Parsed Results */}
                <div className="flex flex-col gap-3">
                  <p className="text-xs font-bold uppercase tracking-widest px-0.5" style={{ color: "var(--section-title)" }}>
                    Parsed Results
                  </p>
                  <div className="grid grid-cols-2 gap-5">
                    <TextractResults data={doc?.textract_results} />
                    <OCRResults data={doc?.ocr_ui_results} />
                  </div>
                </div>

                {/* Raw Results */}
                <div className="flex flex-col gap-3">
                  <p className="text-xs font-bold uppercase tracking-widest px-0.5" style={{ color: "var(--section-title)" }}>
                    Raw Results
                  </p>
                  <RawResults
                    textractRaw={doc?.textract_raw_results}
                    ocrRaw={doc?.ocr_raw_results}
                  />
                </div>

                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex flex-col h-screen overflow-hidden"
          style={{ background: "var(--background)" }}
        />
      }
    >
      <AnalyzerContent />
    </Suspense>
  );
}