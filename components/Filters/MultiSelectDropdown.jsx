"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, Check } from "lucide-react";

/**
 * Multi-select variant of the SearchableDropdown pattern used across
 * missing-fields/dexai pages (single-select only). Selecting an option
 * toggles it in `values` without closing the menu, so several can be
 * picked in one open. Used for the company filter on the Bug Tracker page
 * and the homepage stats section.
 */
export default function MultiSelectDropdown({
  icon: Icon,
  placeholder,
  searchPlaceholder = "Search...",
  emptyText = "No results",
  options,
  values = [],
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          (o.sublabel || "").toLowerCase().includes(q)
      )
    : options;

  const toggle = (val) => {
    onChange(
      values.includes(val) ? values.filter((v) => v !== val) : [...values, val]
    );
  };

  const label =
    values.length === 0
      ? placeholder
      : values.length === 1
      ? options.find((o) => o.value === values[0])?.label || placeholder
      : `${values.length} selected`;

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 210 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 12px",
          fontSize: 13,
          width: "100%",
          border: "1px solid var(--input-border)",
          borderRadius: 8,
          background: values.length ? "var(--tag-bg)" : "var(--input-bg)",
          color: values.length ? "var(--accent)" : "var(--text-muted)",
          cursor: "pointer",
          outline: "none",
        }}
      >
        {Icon && <Icon size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />}
        <span
          style={{
            flex: 1,
            textAlign: "left",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
        <ChevronDown
          size={14}
          style={{
            color: "var(--text-muted)",
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.12s ease",
          }}
        />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 50,
            width: "max(100%, 260px)",
            background: "var(--menu-bg)",
            border: "1px solid var(--panel-border)",
            borderRadius: 8,
            boxShadow: "var(--shadow-sm)",
            padding: 4,
          }}
        >
          <div style={{ position: "relative", marginBottom: 4 }}>
            <Search
              size={13}
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              style={{
                width: "100%",
                padding: "8px 10px 8px 30px",
                fontSize: 13,
                border: "1px solid var(--input-border)",
                borderRadius: 6,
                background: "var(--input-bg)",
                color: "var(--foreground)",
                outline: "none",
              }}
            />
          </div>

          {values.length > 0 && (
            <div
              role="button"
              onClick={() => onChange([])}
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                color: "var(--accent)",
                borderBottom: "1px solid var(--panel-border)",
                marginBottom: 4,
              }}
            >
              Clear selection ({values.length})
            </div>
          )}

          <div style={{ maxHeight: 280, overflowY: "auto", overflowX: "hidden" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "10px", fontSize: 12, color: "var(--text-muted)" }}>
                {emptyText}
              </div>
            ) : (
              filtered.map((o) => {
                const checked = values.includes(o.value);
                return (
                  <div
                    key={o.value}
                    role="button"
                    onClick={() => toggle(o.value)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--input-bg)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = checked ? "var(--input-bg)" : "transparent";
                    }}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      background: checked ? "var(--input-bg)" : "transparent",
                    }}
                  >
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        border: `1px solid ${checked ? "var(--accent)" : "var(--input-border)"}`,
                        background: checked ? "var(--accent)" : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {checked && <Check size={11} color="#fff" />}
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 1, overflow: "hidden" }}>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: checked ? 600 : 500,
                          color: "var(--foreground)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {o.label}
                      </span>
                      {o.sublabel && (
                        <span
                          style={{
                            fontSize: 10,
                            color: "var(--text-muted)",
                            fontFamily: "ui-monospace, SFMono-Regular, monospace",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {o.sublabel}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
