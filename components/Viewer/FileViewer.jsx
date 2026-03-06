"use client";

import { useState, memo } from "react";
import { Eye, EyeOff, FileText, AlertCircle, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { useDocumentStore } from "@/lib/store";

const ZOOM_STEP = 0.15;
const ZOOM_MIN  = 0.3;
const ZOOM_MAX  = 3;

function FileViewerSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4 h-full">
      <div className="skeleton h-4 w-32 rounded" />
      <div className="skeleton flex-1 rounded-lg" style={{ minHeight: 200 }} />
    </div>
  );
}

function FileViewer({ document, isLoading }) {
  const [isVisible, setIsVisible] = useState(true);
  const [zoom, setZoom]           = useState(1);
  const { activeId } = useDocumentStore();

  const zoomIn    = () => setZoom((z) => Math.min(+(z + ZOOM_STEP).toFixed(2), ZOOM_MAX));
  const zoomOut   = () => setZoom((z) => Math.max(+(z - ZOOM_STEP).toFixed(2), ZOOM_MIN));
  const zoomReset = () => setZoom(1);

  if (!activeId) {
    return (
      <div className="flex items-center justify-center h-full py-12">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-[var(--tag-bg)] flex items-center justify-center mx-auto mb-3">
            <FileText size={22} className="text-[var(--accent)]" />
          </div>
          <p className="text-sm font-medium text-[var(--foreground)]">No File Open</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Select a document from the sidebar</p>
        </div>
      </div>
    );
  }

  if (isLoading) return <FileViewerSkeleton />;

  const signedUrl  = document?.signed_url;
  const sourceFile = document?.source_file;

  const isImage = sourceFile && /\.(png|jpg|jpeg|gif|webp|bmp|tiff?)$/i.test(sourceFile);
  const isPdf   = sourceFile && /\.pdf$/i.test(sourceFile);

  const btnCls = "flex items-center justify-center w-7 h-7 rounded-md transition-colors text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--panel-border)]";

  return (
    <div className="flex flex-col">
      {/* ── toolbar ── */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b gap-2"
        style={{ borderColor: "var(--panel-border)", background: "var(--input-bg)" }}
      >
        {/* filename */}
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={13} className="text-[var(--text-muted)] shrink-0" />
          <span className="text-xs text-[var(--text-muted)] truncate font-mono" title={sourceFile}>
            {sourceFile || "No source file"}
          </span>
        </div>

        {/* zoom controls — only for image/pdf */}
        {signedUrl && (isImage || isPdf) && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={zoomOut}   disabled={zoom <= ZOOM_MIN} className={btnCls} title="Zoom out"><ZoomOut  size={13} /></button>
            <button
              onClick={zoomReset}
              className="px-1.5 h-7 rounded-md text-[10px] font-mono font-semibold transition-colors text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--panel-border)]"
              title="Reset zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button onClick={zoomIn}    disabled={zoom >= ZOOM_MAX} className={btnCls} title="Zoom in" ><ZoomIn   size={13} /></button>
            <button onClick={zoomReset} className={btnCls}           title="Reset"     ><RotateCcw size={12} /></button>
          </div>
        )}

        {/* hide/show */}
        <button
          onClick={() => setIsVisible((v) => !v)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--panel-border)] transition-colors shrink-0"
        >
          {isVisible ? <EyeOff size={12} /> : <Eye size={12} />}
          {isVisible ? "Hide" : "Show"}
        </button>
      </div>

      {isVisible && (
        <div className="overflow-auto bg-[var(--input-bg)]">
          {!signedUrl ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 p-4 text-center">
              <AlertCircle size={28} className="text-amber-400" />
              <p className="text-sm text-[var(--text-muted)]">
                File unavailable or no source file set
              </p>
            </div>
          ) : isImage ? (
            <div className="flex items-center justify-center p-2 min-h-48">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signedUrl}
                alt={sourceFile}
                style={{ transform: `scale(${zoom})`, transformOrigin: "top center", transition: "transform 0.15s ease" }}
                className="object-contain rounded shadow-sm"
              />
            </div>
          ) : isPdf ? (
            <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left", transition: "transform 0.15s ease",
                          width: `${100 / zoom}%`, height: `calc((100vh - 112px) / ${zoom})` }}>
              <iframe
                src={signedUrl}
                className="w-full h-full"
                title="Document PDF"
              />
            </div>
          ) : (
            <iframe
              src={signedUrl}
              className="w-full"
              style={{ height: "calc(100vh - 112px)" }}
              title="Document File"
            />
          )}
        </div>
      )}
    </div>
  );
}

export default memo(FileViewer);
