"use client";

import { useState, useEffect, useRef, memo } from "react";
import {
  Eye,
  EyeOff,
  FileText,
  AlertCircle,
  ImageOff,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { useDocumentStore } from "@/lib/store";

const ZOOM_STEP = 0.15;
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 3;

/* source_file may be a bare key, an s3:// URI, or a full presigned HTTPS URL
   with query params. Pull the pathname so extension checks work either way. */
function getPathPart(src) {
  if (!src) return "";
  try {
    return new URL(src).pathname;
  } catch {
    return String(src).split("?")[0];
  }
}

function getDisplayName(src, filename) {
  if (filename) return filename;
  const path = getPathPart(src);
  return decodeURIComponent(path.split("/").filter(Boolean).pop() || src || "");
}

function FileViewerSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4 h-full">
      <div className="skeleton h-4 w-32 rounded" />
      <div className="skeleton flex-1 rounded-lg" style={{ minHeight: 200 }} />
    </div>
  );
}

function FileViewer({ document, isLoading, onRefresh }) {
  const [isVisible, setIsVisible] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [imgError, setImgError] = useState(false);
  const [imgLoading, setImgLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  const { activeId } = useDocumentStore();
  const docId = document?.id ?? activeId;

  const signedUrl = document?.signed_url;
  const sourceFile = document?.source_file;
  const originalFilename = document?.original_filename;

  // Reset image state when signedUrl or document changes
  useEffect(() => {
    setImgError(false);
    setImgLoading(true);
  }, [signedUrl, docId]);

  // Auto-schedule a refresh just before the signed URL expires (1 hour = 3600s).
  useEffect(() => {
    if (!onRefresh) return;
    const timer = setTimeout(() => {
      onRefresh();
    }, 55 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [onRefresh]);

  const zoomIn = () => setZoom((z) => Math.min(+(z + ZOOM_STEP).toFixed(2), ZOOM_MAX));
  const zoomOut = () => setZoom((z) => Math.max(+(z - ZOOM_STEP).toFixed(2), ZOOM_MIN));
  const zoomReset = () => setZoom(1);

  if (!docId) {
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

  const pathOnly = getPathPart(sourceFile);
  const displayName = getDisplayName(sourceFile, originalFilename);

  const checkExt = pathOnly || originalFilename || "";
  const isImage = /\.(png|jpg|jpeg|gif|webp|bmp|tiff?)$/i.test(checkExt);
  const isPdf = /\.pdf$/i.test(checkExt);

  const btnCls =
    "flex items-center justify-center w-7 h-7 rounded-md transition-colors text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--panel-border)]";

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
          <span className="text-xs text-[var(--text-muted)] truncate font-mono" title={sourceFile || originalFilename}>
            {displayName || "No source file"}
          </span>
        </div>

        {/* zoom controls — only for image/pdf */}
        {signedUrl && (isImage || isPdf) && !imgError && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={zoomOut} disabled={zoom <= ZOOM_MIN} className={btnCls} title="Zoom out">
              <ZoomOut size={13} />
            </button>
            <button
              onClick={zoomReset}
              className="px-1.5 h-7 rounded-md text-[10px] font-mono font-semibold transition-colors text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--panel-border)]"
              title="Reset zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button onClick={zoomIn} disabled={zoom >= ZOOM_MAX} className={btnCls} title="Zoom in">
              <ZoomIn size={13} />
            </button>
            <button onClick={zoomReset} className={btnCls} title="Reset">
              <RotateCcw size={12} />
            </button>
          </div>
        )}

        <div className="flex items-center gap-1 shrink-0">
          {/* download */}
          {signedUrl && (
            <a
              href={`/api/document/${docId}/download`}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--panel-border)] transition-colors"
              title="Download file"
            >
              <Download size={12} />
              Download
            </a>
          )}

          {/* hide/show */}
          <button
            onClick={() => setIsVisible((v) => !v)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--panel-border)] transition-colors"
          >
            {isVisible ? <EyeOff size={12} /> : <Eye size={12} />}
            {isVisible ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      {isVisible && (
        <div className="overflow-auto bg-[var(--input-bg)]">
          {!signedUrl ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 p-6 text-center">
              <AlertCircle size={28} className="text-amber-400" />
              <p className="text-sm text-[var(--text-muted)]">
                {sourceFile ? "File not found in storage" : "No source file set for this document"}
              </p>
              {sourceFile && (
                <p className="text-xs text-[var(--text-muted)] font-mono break-all max-w-md">
                  {sourceFile}
                </p>
              )}
            </div>
          ) : isImage ? (
            <div className="flex flex-col items-center justify-center p-3 min-h-48 relative">
              {imgError ? (
                <div className="flex flex-col items-center gap-3 py-10 px-4 text-center">
                  <ImageOff size={28} className="text-amber-400 opacity-80" />
                  <div>
                    <p className="text-xs font-semibold text-[var(--foreground)]">
                      Failed to render image preview
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      The image URL could not be loaded in browser.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      onClick={() => {
                        setImgError(false);
                        setImgLoading(true);
                        setRetryKey((k) => k + 1);
                        if (onRefresh) onRefresh();
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border border-[var(--panel-border)] bg-[var(--panel-bg)] hover:bg-[var(--input-bg)] text-[var(--foreground)] cursor-pointer"
                    >
                      <RefreshCw size={11} />
                      Retry Preview
                    </button>
                    <a
                      href={signedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium text-[var(--accent)] hover:underline"
                    >
                      <ExternalLink size={11} />
                      Open file
                    </a>
                  </div>
                </div>
              ) : (
                <>
                  {imgLoading && (
                    <div className="flex flex-col items-center gap-2 py-8 text-center absolute inset-0 justify-center bg-[var(--input-bg)] bg-opacity-75 z-10">
                      <RefreshCw size={20} className="text-[var(--accent)] animate-spin" />
                      <p className="text-xs text-[var(--text-muted)]">Loading image…</p>
                    </div>
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    key={`${signedUrl}-${retryKey}`}
                    src={signedUrl}
                    alt={displayName || "document"}
                    onLoad={() => setImgLoading(false)}
                    onError={() => {
                      setImgLoading(false);
                      setImgError(true);
                    }}
                    style={{
                      transform: `scale(${zoom})`,
                      transformOrigin: "top center",
                      transition: "transform 0.15s ease",
                      maxWidth: "100%",
                    }}
                    className="object-contain rounded shadow-sm"
                  />
                </>
              )}
            </div>
          ) : isPdf ? (
            <div
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
                transition: "transform 0.15s ease",
                width: `${100 / zoom}%`,
                height: `calc((100vh - 112px) / ${zoom})`,
              }}
            >
              <iframe src={signedUrl} className="w-full h-full" title={displayName || "Document PDF"} />
            </div>
          ) : (
            <iframe
              src={signedUrl}
              className="w-full"
              style={{ height: "calc(100vh - 112px)" }}
              title={displayName || "Document File"}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default memo(FileViewer);
