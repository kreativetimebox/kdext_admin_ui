"use client";

import { useState, useMemo, useDeferredValue } from "react";
import { useQuery } from "@tanstack/react-query";
import { List } from "react-window";
import axios from "axios";
import SidebarItem from "./SidebarItem";
import { FileText, Search, X } from "lucide-react";

const ROW_HEIGHT = 40;

function SkeletonItem() {
  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 border-b"
      style={{ borderColor: "var(--panel-border)" }}
    >
      <div className="skeleton rounded w-8 h-4 shrink-0" />
      <div className="skeleton rounded flex-1 h-3" />
    </div>
  );
}

/* Row renderer for react-window — `index` selects from `rowProps.items`. */
function Row({ index, style, items }) {
  const doc = items[index];
  if (!doc) return null;
  return (
    <div style={style}>
      <SidebarItem
        id={doc.id}
        result_id={doc.result_id}
        ocr_document_type={doc.ocr_document_type}
      />
    </div>
  );
}

export default function SidebarList({ onlyId = null }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const res = await axios.get("/api/documents");
      return res.data.documents;
    },
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const documents = data || [];

  const [search, setSearch] = useState("");
  // useDeferredValue keeps typing responsive even with a 15k-row filter.
  const deferredSearch = useDeferredValue(search);

  const visibleDocuments = useMemo(() => {
    const scopedDocs = onlyId
      ? documents.filter((d) => String(d.id) === String(onlyId))
      : documents;

    const q = deferredSearch.trim().toLowerCase();
    if (!q) return scopedDocs;
    return scopedDocs.filter(
      (d) =>
        String(d.result_id ?? d.id).toLowerCase().includes(q) ||
        String(d.request_id ?? "").toLowerCase().includes(q) ||
        String(d.transaction_id ?? "").toLowerCase().includes(q) ||
        (d.ocr_document_type || "").toLowerCase().includes(q)
    );
  }, [documents, deferredSearch, onlyId]);

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center mb-1"
          style={{ background: "#fee2e2" }}
        >
          <FileText size={16} color="#ef4444" />
        </div>
        <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
          Failed to load
        </p>
        <button
          onClick={() => refetch()}
          className="text-xs px-4 py-1.5 rounded-lg font-semibold text-white transition-opacity hover:opacity-80"
          style={{ background: "var(--accent)" }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Header */}
      <div
        className="shrink-0 px-4 py-3 border-b"
        style={{ borderColor: "var(--panel-border)" }}
      >
        <div className="flex items-center justify-between">
          <span
            className="text-[11px] font-bold tracking-widest uppercase"
            style={{ color: "var(--text-muted)" }}
          >
            Documents
          </span>
          {!isLoading && visibleDocuments.length > 0 && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {visibleDocuments.length.toLocaleString()}
            </span>
          )}
        </div>
        <div className="relative mt-2">
          <Search
            size={11}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by result ID, request ID, transaction ID…"
            className="w-full h-7 pl-7 pr-7 text-xs rounded-lg border outline-none"
            style={{
              background: "var(--input-bg)",
              borderColor: "var(--input-border)",
              color: "var(--foreground)",
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2"
              style={{ color: "var(--text-muted)" }}
            >
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="overflow-y-auto h-full">
            {Array.from({ length: 14 }).map((_, i) => (
              <SkeletonItem key={i} />
            ))}
          </div>
        ) : visibleDocuments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-1">
            <FileText
              size={20}
              style={{ color: "var(--text-muted)", opacity: 0.4 }}
            />
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {search ? "No matches" : "No documents found"}
            </p>
          </div>
        ) : (
          <List
            style={{ height: "100%", width: "100%" }}
            rowComponent={Row}
            rowCount={visibleDocuments.length}
            rowHeight={ROW_HEIGHT}
            rowProps={{ items: visibleDocuments }}
            overscanCount={8}
          />
        )}
      </div>
    </div>
  );
}
