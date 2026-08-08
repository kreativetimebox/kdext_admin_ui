"use client";

import { useRef } from "react";
import { Bold, Italic, Underline } from "lucide-react";

const FONT_SIZES = [
  { label: "Small", px: 12 },
  { label: "Normal", px: 14 },
  { label: "Large", px: 18 },
  { label: "X-Large", px: 24 },
];

const COLORS = ["#111827", "#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7"];

function ToolbarButton({ onClick, title, children }) {
  return (
    <button
      type="button"
      title={title}
      // Keep the textarea's selection intact — losing focus to the button
      // would clear selectionStart/selectionEnd before onClick can read them.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 28, height: 28, borderRadius: 6, cursor: "pointer",
        border: "1px solid var(--panel-border)",
        background: "var(--input-bg)", color: "var(--foreground)",
      }}
    >
      {children}
    </button>
  );
}

// A single plain <textarea> for the announcement body. Plain text and raw
// HTML tags can both be typed or pasted directly into the same box — the
// feed renders this value with dangerouslySetInnerHTML + white-space:
// pre-wrap (see app/announcements/page.js), so literal text keeps its line
// breaks and any HTML tags render as real formatting. The toolbar is just a
// convenience for wrapping the current selection in the matching tag; it
// edits this same textarea rather than a separate surface.
export default function RichBodyEditor({ value, onChange, placeholder }) {
  const taRef = useRef(null);

  const wrap = (before, after) => {
    const ta = taRef.current;
    if (!ta) return;
    const { selectionStart: start, selectionEnd: end } = ta;
    const selected = value.slice(start, end);
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    // Restore focus + selection after the controlled value updates so the
    // next click continues from where the user left off.
    requestAnimationFrame(() => {
      ta.focus();
      const newStart = start + before.length;
      ta.setSelectionRange(newStart, newStart + selected.length);
    });
  };

  const wrapSpanStyle = (style) => wrap(`<span style="${style}">`, "</span>");

  return (
    <div>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
          padding: "6px 8px", border: "1px solid var(--panel-border)",
          borderBottom: "none", borderRadius: "8px 8px 0 0", background: "var(--input-bg)",
        }}
      >
        <ToolbarButton title="Bold" onClick={() => wrap("<b>", "</b>")}>
          <Bold size={14} />
        </ToolbarButton>
        <ToolbarButton title="Italic" onClick={() => wrap("<i>", "</i>")}>
          <Italic size={14} />
        </ToolbarButton>
        <ToolbarButton title="Underline" onClick={() => wrap("<u>", "</u>")}>
          <Underline size={14} />
        </ToolbarButton>

        <select
          defaultValue=""
          onChange={(e) => {
            const px = e.target.value;
            if (px) wrapSpanStyle(`font-size:${px}px`);
            e.target.value = "";
          }}
          title="Font size"
          style={{
            padding: "4px 6px", fontSize: 12, borderRadius: 6,
            border: "1px solid var(--panel-border)", background: "var(--input-bg)", color: "var(--foreground)",
          }}
        >
          <option value="" disabled>Size</option>
          {FONT_SIZES.map((s) => (
            <option key={s.px} value={s.px}>{s.label}</option>
          ))}
        </select>

        <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => wrapSpanStyle(`color:${c}`)}
              style={{
                width: 18, height: 18, borderRadius: "50%", background: c,
                border: "1px solid var(--panel-border)", cursor: "pointer", padding: 0,
              }}
            />
          ))}
          <input
            type="color"
            title="Custom color"
            onChange={(e) => wrapSpanStyle(`color:${e.target.value}`)}
            style={{ width: 22, height: 22, padding: 0, border: "none", background: "none", cursor: "pointer" }}
          />
        </div>
      </div>

      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={6}
        style={{
          width: "100%", padding: "10px 12px", fontSize: 14, lineHeight: 1.5, resize: "vertical",
          background: "var(--input-bg)", border: "1px solid var(--panel-border)",
          borderRadius: "0 0 8px 8px", color: "var(--foreground)",
        }}
      />
    </div>
  );
}
