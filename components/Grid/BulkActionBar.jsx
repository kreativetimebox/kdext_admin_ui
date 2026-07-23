"use client";

import { useState } from "react";
import toast from "react-hot-toast";

/**
 * Generic bulk-action toolbar for grid tables — shown once at least one row
 * is selected. Renders "N selected" + Clear, plus one dropdown+Apply control
 * per configured action. Each apply requires an explicit confirm (these run
 * across many rows at once, unlike the instant-apply per-row dropdowns) and
 * reports a summary toast when done.
 *
 * @param {number} selectedCount
 * @param {() => void} onClear
 * @param {Array<{
 *   key: string,
 *   label: string,
 *   options: Array<{value: string, label: string}>,
 *   placeholder: string,
 *   confirmText: (value: string, count: number) => string,
 *   run: (value: string, onProgress: (done: number, total: number) => void) => Promise<{succeeded: number, failed: number}>,
 * }>} actions
 */
export default function BulkActionBar({ selectedCount, onClear, actions }) {
  const [values, setValues] = useState({});
  const [busyKey, setBusyKey] = useState(null);
  const [progress, setProgress] = useState(null);

  if (selectedCount === 0) return null;

  async function apply(action) {
    const value = values[action.key];
    if (!value) {
      toast.error(`Choose a value for ${action.label} first`);
      return;
    }
    if (!window.confirm(action.confirmText(value, selectedCount))) return;

    setBusyKey(action.key);
    setProgress({ done: 0, total: selectedCount });
    try {
      const { succeeded, failed } = await action.run(value, (done, total) => setProgress({ done, total }));
      toast.success(`${action.label}: ${succeeded} updated${failed ? `, ${failed} failed` : ""}.`);
    } catch (err) {
      toast.error(err?.message || `Bulk ${action.label} failed`);
    } finally {
      setBusyKey(null);
      setProgress(null);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
        padding: "10px 16px",
        marginBottom: 16,
        background: "var(--tag-bg, rgba(37,99,235,0.08))",
        border: "1px solid var(--accent, #2563eb)",
        borderRadius: 10,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", whiteSpace: "nowrap" }}>
        {selectedCount} selected
      </span>
      <button
        type="button"
        onClick={onClear}
        style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}
      >
        Clear
      </button>

      {actions.map((action) => {
        const isBusy = busyKey === action.key;
        return (
          <div key={action.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <select
              value={values[action.key] || ""}
              onChange={(e) => setValues((prev) => ({ ...prev, [action.key]: e.target.value }))}
              disabled={isBusy}
              style={{ padding: "6px 10px", fontSize: 12.5, borderRadius: 6, border: "1px solid var(--panel-border)", background: "var(--input-bg)", color: "var(--foreground)" }}
            >
              <option value="">{action.placeholder}</option>
              {action.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => apply(action)}
              disabled={isBusy || !values[action.key] || (busyKey && !isBusy)}
              style={{
                padding: "6px 12px",
                fontSize: 12.5,
                fontWeight: 600,
                borderRadius: 6,
                border: "none",
                background: "var(--brand-gradient)",
                color: "#fff",
                cursor: isBusy || !values[action.key] ? "not-allowed" : "pointer",
                opacity: !values[action.key] || (busyKey && !isBusy) ? 0.6 : 1,
                whiteSpace: "nowrap",
              }}
            >
              {isBusy ? (progress ? `${progress.done}/${progress.total}…` : "Applying…") : `Set ${action.label}`}
            </button>
          </div>
        );
      })}
    </div>
  );
}
