"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import toast from "react-hot-toast";
import { Sun, Moon, Database } from "lucide-react";
import { useDocumentStore, useThemeStore } from "@/lib/store";
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
export default function HomePage() {
  const { activeId, setDocument } = useDocumentStore();
  const { isDark, toggleTheme, initTheme } = useThemeStore();

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
      <header
        className="flex items-center justify-between px-6 shrink-0 z-20 relative"
        style={{
          height: 56,
          background: "var(--header-bg)",
          borderBottom: "1px solid var(--panel-border)",
          boxShadow: "0 1px 0 var(--panel-border), 0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={
              { background: "linear-gradient(135deg, var(--accent) 0%, #6366f1 100%)",
                boxShadow: "0 2px 8px rgba(37,99,235,0.35)" }
            }
          >
            <Database size={15} color="#fff" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight leading-none" style={{ color: "var(--foreground)" }}>
              kdext_manual_analyzer
            </span>
            <span className="text-[10px] leading-tight" style={{ color: "var(--text-muted)" }}>
              OCR &amp; Textract
            </span>
          </div>
        </div>

        {/* Theme toggle */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-full cursor-pointer select-none"
          style={{
            background: "var(--input-bg)",
            border: "1px solid var(--panel-border)",
          }}
          onClick={toggleTheme}
        >
          <Sun size={12} className="text-amber-400" />
          <div
            className="relative w-8 h-4 rounded-full"
            style={{
              background: isDark ? "var(--accent)" : "var(--input-border)",
              transition: "background 0.3s",
            }}
          >
            <span
              className="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow"
              style={{
                transform: isDark ? "translateX(16px)" : "translateX(0)",
                transition: "transform 0.3s",
              }}
            />
          </div>
          <Moon size={12} style={{ color: "var(--text-muted)" }} />
        </div>
      </header>

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
          <SidebarList />
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