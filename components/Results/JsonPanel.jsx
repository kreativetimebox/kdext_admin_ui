"use client";

import { useState, memo, useCallback } from "react";
import { ChevronDown, ChevronRight, Braces, Copy, Check } from "lucide-react";
import SyntaxHighlighter from "react-syntax-highlighter";
import { atomOneDark, atomOneLight } from "react-syntax-highlighter/dist/cjs/styles/hljs";
import { useThemeStore } from "@/lib/store";

const VARIANT_COLORS = {
  default: { iconBg: "var(--tag-bg)",        iconColor: "var(--tag-color)" },
  blue:    { iconBg: "var(--tag-bg)",        iconColor: "var(--accent)" },
  green:   { iconBg: "var(--tag-green-bg)",  iconColor: "var(--tag-green-color)" },
  amber:   { iconBg: "var(--tag-amber-bg)",  iconColor: "var(--tag-amber-color)" },
  purple:  { iconBg: "var(--tag-purple-bg)", iconColor: "var(--tag-purple-color)" },
};

function JsonPanel({ title, data, defaultOpen = false, variant = "default" }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const { isDark } = useThemeStore();

  const isEmpty    = !data || (typeof data === "object" && Object.keys(data).length === 0);
  const jsonString = isEmpty ? null : JSON.stringify(data, null, 2);
  const keyCount   = isEmpty ? 0 : Object.keys(data).length;
  const vc         = VARIANT_COLORS[variant] ?? VARIANT_COLORS.default;

  const handleCopy = useCallback(async (e) => {
    e.stopPropagation();
    if (!jsonString) return;
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [jsonString]);

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden"
      style={{
        background: "var(--panel-bg)",
        border: "1px solid var(--panel-border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* ── Header ── */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setIsOpen((o) => !o); } }}
        className="flex items-center justify-between w-full px-4 py-3 text-left select-none transition-colors cursor-pointer"
        style={{ borderBottom: isOpen ? "1px solid var(--panel-border)" : "none" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--input-bg)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "")}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
            style={{ background: vc.iconBg }}
          >
            <Braces size={11} style={{ color: vc.iconColor }} />
          </div>
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            {title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {!isEmpty && (
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
              style={{ background: vc.iconBg, color: vc.iconColor }}
            >
              {keyCount} key{keyCount !== 1 ? "s" : ""}
            </span>
          )}
          {!isEmpty && isOpen && (
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center justify-center w-6 h-6 rounded-md transition-colors"
              style={{ background: "var(--panel-border)" }}
              title="Copy JSON"
            >
              {copied
                ? <Check size={11} className="text-green-500" />
                : <Copy size={11} style={{ color: "var(--text-muted)" }} />
              }
            </button>
          )}
          <span style={{ color: "var(--text-muted)" }}>
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        </div>
      </div>

      {/* ── Body ── */}
      {isOpen && (
        isEmpty ? (
          <p className="px-4 py-3 text-xs italic" style={{ color: "var(--text-muted)" }}>
            No data available
          </p>
        ) : (
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            <SyntaxHighlighter
              language="json"
              style={isDark ? atomOneDark : atomOneLight}
              customStyle={{
                margin: 0,
                padding: "14px 16px",
                background: isDark ? "#0d1117" : "#f8fafc",
                fontSize: "11.5px",
                lineHeight: "1.7",
                borderRadius: 0,
              }}
              wrapLongLines
            >
              {jsonString}
            </SyntaxHighlighter>
          </div>
        )
      )}

      {/* ── Collapsed hint ── */}
      {!isOpen && (
        <div className="px-4 pb-2.5 text-[11px] italic" style={{ color: "var(--text-muted)" }}>
          {isEmpty ? "No data" : "Click to expand"}
        </div>
      )}
    </div>
  );
}

export default memo(JsonPanel);
