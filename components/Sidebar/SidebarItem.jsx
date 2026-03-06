"use client";

import { Eye } from "lucide-react";
import { useState } from "react";
import { useDocumentStore } from "@/lib/store";

function getTypeMeta(type) {
  const t = (type || "").toLowerCase();
  if (t.includes("receipt")) return { bg: "var(--tag-green-bg)", color: "var(--tag-green-color)" };
  if (t.includes("invoice")) return { bg: "var(--tag-amber-bg)", color: "var(--tag-amber-color)" };
  return { bg: "var(--tag-bg)", color: "var(--tag-color)" };
}

export default function SidebarItem({ id, ocr_document_type }) {
  const { activeId, setActiveId } = useDocumentStore();
  const isActive = activeId === id;
  const [hovered, setHovered] = useState(false);
  const meta = getTypeMeta(ocr_document_type);

  return (
    <div
      onClick={() => setActiveId(id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-center gap-2.5 px-3 py-2 cursor-pointer border-b border-l-[3px] select-none"
      style={{
        borderBottomColor: "var(--panel-border)",
        borderLeftColor: isActive ? "var(--accent)" : "transparent",
        background: isActive ? "var(--active-row)" : hovered ? "var(--input-bg)" : "transparent",
        transition: "background 0.12s ease, border-left-color 0.12s ease",
      }}
    >
      {/* ID chip */}
      <span
        className="shrink-0 text-[10px] font-bold font-mono tabular-nums px-1.5 py-0.5 rounded"
        style={{
          background: isActive ? "var(--accent)" : "var(--input-bg)",
          color: isActive ? "#fff" : "var(--text-muted)",
          border: "1px solid",
          borderColor: isActive ? "var(--accent)" : "var(--panel-border)",
          minWidth: 36,
          textAlign: "center",
        }}
      >
        {id}
      </span>

      {/* Type badge */}
      <span
        className="flex-1 min-w-0 text-[11px] font-medium px-2 py-0.5 rounded-full truncate capitalize"
        style={{ background: meta.bg, color: meta.color }}
        title={ocr_document_type}
      >
        {ocr_document_type || "—"}
      </span>

      {/* Eye icon */}
      <Eye
        size={12}
        style={{
          flexShrink: 0,
          opacity: isActive ? 1 : hovered ? 0.45 : 0,
          color: "var(--accent)",
          transition: "opacity 0.15s",
        }}
      />
    </div>
  );
}

