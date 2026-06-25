"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import {
  ChevronDown,
  UploadCloud,
  Plus,
  Trash2,
  CheckCircle2,
  ListOrdered,
  Database,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  History,
  User as UserIcon,
} from "lucide-react";

/* ── Meta keys we attach to the JSON to record publish/audit state.
   They are hidden from the editable view and ignored when diffing. ── */
const META_KEYS = new Set([
  "_published",
  "_published_at",
  "_published_by",
  "_audit",
]);

/* ── Helpers ─────────────────────────────────────────────── */
function toLabel(key) {
  return String(key)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isArrayOfObjects(v) {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every((row) => row && typeof row === "object" && !Array.isArray(row))
  );
}

function isPlainObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function isLongValue(v) {
  return typeof v === "string" && v.length > 60;
}

/* Pull a sensible flat field object from however the result is stored. */
function unwrapFields(data) {
  if (!data || typeof data !== "object") return {};
  if (isPlainObject(data.formatted_result)) return data.formatted_result;
  return data;
}

function isMultiReceipt(fields) {
  return (
    fields &&
    Array.isArray(fields.multiple_receipts) &&
    fields.multiple_receipts.length > 0
  );
}

/* ── Diff the edited fields against the last-saved baseline to record which
   fields a publish changed (top level + one level into nested objects). ── */
function diffObject(base, cur, prefix, out) {
  const keys = new Set(
    [...Object.keys(base || {}), ...Object.keys(cur || {})].filter(
      (k) => !META_KEYS.has(k)
    )
  );
  for (const k of keys) {
    const b = base?.[k];
    const c = cur?.[k];
    if (isPlainObject(b) && isPlainObject(c)) {
      diffObject(b, c, `${prefix}${toLabel(k)} › `, out);
    } else if (JSON.stringify(b) !== JSON.stringify(c)) {
      out.push(`${prefix}${toLabel(k)}`);
    }
  }
}

function computeChanges(base, cur) {
  const out = [];
  if (isMultiReceipt(base) || isMultiReceipt(cur)) {
    const bn = base?.multiple_receipts || [];
    const cn = cur?.multiple_receipts || [];
    const n = Math.max(bn.length, cn.length);
    for (let i = 0; i < n; i++) {
      diffObject(bn[i] || {}, cn[i] || {}, `Receipt ${i + 1} › `, out);
    }
  } else {
    diffObject(base || {}, cur || {}, "", out);
  }
  return out;
}

function formatTimestamp(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

/* Coerce the typed string back toward the original value's type so we don't
   silently turn numbers into strings in the stored JSON. */
function coerceValue(original, input) {
  if (typeof original === "number") {
    if (input.trim() === "") return null;
    const n = Number(input);
    return Number.isNaN(n) ? input : n;
  }
  if (typeof original === "boolean") return input === "true";
  return input;
}

function toInputString(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

const TOTAL_KEYS = new Set([
  "totalamount", "total_amount", "total", "grandtotal", "grand_total", "amountdue", "amount_due",
]);
function isTotalKey(key) {
  return TOTAL_KEYS.has(String(key).toLowerCase().replace(/[^a-z]/g, ""));
}

/* Keys whose value is a line-item array — treated as a table even when empty,
   so the reviewer gets column headers and can add rows. */
const ITEM_ARRAY_KEYS = new Set([
  "items", "tableitems", "lineitems", "invoiceitems", "receiptitems", "transactions",
]);
function isItemsKey(key) {
  return ITEM_ARRAY_KEYS.has(String(key).toLowerCase().replace(/[^a-z]/g, ""));
}
const DEFAULT_ITEM_COLUMNS = [
  "description", "quantity", "unit_price", "tax_amount", "net_amount", "discount_amount", "total_amount",
];
function isTableEntry(key, v) {
  return isArrayOfObjects(v) || (Array.isArray(v) && isItemsKey(key));
}
/* Preferred left-to-right order for bank-statement style tables. Columns are
   matched loosely (normalized key contains the token) so variants like
   "debit_amount"/"debitamount" all line up. Unlisted columns keep their
   original order after the preferred ones. */
const PREFERRED_COLUMN_ORDER = ["date", "description", "credit", "debit", "balance"];
function rankColumn(col) {
  const norm = String(col).toLowerCase().replace(/[^a-z]/g, "");
  const i = PREFERRED_COLUMN_ORDER.findIndex((t) => norm.includes(t));
  return i === -1 ? PREFERRED_COLUMN_ORDER.length : i;
}
function orderColumns(cols) {
  // Only reorder when the table looks like a bank statement (has both a
  // balance-style and a date-style column), so item tables stay untouched.
  const hasBalance = cols.some((c) => rankColumn(c) === PREFERRED_COLUMN_ORDER.indexOf("balance"));
  const hasDate = cols.some((c) => rankColumn(c) === PREFERRED_COLUMN_ORDER.indexOf("date"));
  if (!hasBalance || !hasDate) return cols;
  return cols
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rankColumn(a.c) - rankColumn(b.c) || a.i - b.i)
    .map((x) => x.c);
}
function columnsFor(key, rows) {
  const cols = tableColumns(rows);
  if (cols.length > 0) return orderColumns(cols);
  return isItemsKey(key) ? DEFAULT_ITEM_COLUMNS : [];
}

/* Compact two-column field grid, matching the OCR RESULTS card layout */
const FIELD_GRID = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  columnGap: 32,
  rowGap: 18,
};

/* ── Collapsible card with icon-headed title bar ─────────── */
function SectionCard({ id, title, icon, count, open, onToggle, children }) {
  return (
    <div
      style={{
        background: "var(--panel-bg)",
        border: "1px solid var(--panel-border)",
        borderRadius: 12,
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => onToggle(id)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 18px",
          background: "transparent",
          border: "none",
          borderBottom: open ? "1px solid var(--panel-border)" : "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: "var(--tag-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <span
          style={{
            flex: 1,
            fontSize: 12,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--foreground)",
          }}
        >
          {title}
          {count != null && (
            <span style={{ color: "var(--text-muted)", marginLeft: 6, fontWeight: 600 }}>
              ({count})
            </span>
          )}
        </span>
        <ChevronDown
          size={16}
          style={{
            color: "var(--text-muted)",
            transition: "transform 0.18s ease",
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
          }}
        />
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

/* ── Single editable scalar field (label over input) ─────── */
function FieldInput({ fieldKey, value, onChange }) {
  const multiline = isLongValue(value);
  const str = toInputString(value);
  const cls = `ed-fld${isTotalKey(fieldKey) ? " ed-fld--total" : ""}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
      <label style={{ fontSize: 11.5, fontWeight: 500, color: "var(--text-muted)" }}>
        {toLabel(fieldKey)}
      </label>
      {multiline ? (
        <textarea
          value={str}
          rows={3}
          placeholder="—"
          onChange={(e) => onChange(e.target.value)}
          className={cls}
          style={{ resize: "vertical", whiteSpace: "pre-wrap" }}
        />
      ) : (
        <input
          type="text"
          value={str}
          placeholder="—"
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        />
      )}
    </div>
  );
}

/* ── Editable raw-JSON field (scalar/empty arrays, deep values) ── */
function JsonField({ fieldKey, value, onChange, onValidity, validityKey }) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState(false);

  const handle = (t) => {
    setText(t);
    try {
      const parsed = JSON.parse(t);
      setError(false);
      onValidity(validityKey, true);
      onChange(parsed);
    } catch {
      setError(true);
      onValidity(validityKey, false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11.5,
          fontWeight: 500,
          color: "var(--text-muted)",
        }}
      >
        {toLabel(fieldKey)}
        {error && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "#ef4444" }}>
            <AlertTriangle size={11} /> invalid JSON
          </span>
        )}
      </label>
      <textarea
        value={text}
        rows={Math.min(10, Math.max(2, text.split("\n").length))}
        onChange={(e) => handle(e.target.value)}
        spellCheck={false}
        className={`ed-json${error ? " ed-json--error" : ""}`}
      />
    </div>
  );
}

/* Every editable field/cell renders as plain text (no outline) until the user
   hovers or focuses it — so at rest it reads exactly like the read-only view. */
const EDITABLE_CSS = `
.ed-fld,.ed-cell,.ed-json{
  width:100%;
  color:var(--foreground);
  background:var(--input-bg);
  border:1px solid var(--input-border);
  outline:none;
  font-family:ui-monospace,SFMono-Regular,monospace;
}
.ed-fld{padding:8px 11px;font-size:14px;font-weight:500;border-radius:8px}
.ed-cell{padding:10px 14px;font-size:13px;border-radius:6px}
.ed-json{padding:8px 11px;font-size:13px;line-height:1.5;border-radius:8px;white-space:pre;resize:vertical}
.ed-fld:hover,.ed-cell:hover,.ed-json:hover{background:var(--input-bg)}
.ed-fld:focus,.ed-cell:focus,.ed-json:focus{background:var(--input-bg)}
.ed-fld--total,.ed-cell--total{color:var(--tag-green-color);font-weight:700}
.ed-json--error{border-color:#ef4444}
.ed-fld::placeholder,.ed-cell::placeholder{color:var(--text-muted)}
.ed-del{opacity:0;transition:opacity .12s ease}
.ed-row:hover .ed-del{opacity:1}
`;

/* ── Editable items table (column headers + text-style cells) ── */
function EditableItemsTable({ rows, columns, onCellChange, onAddRow, onDeleteRow }) {
  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--input-bg)" }}>
              {columns.map((c) => (
                <th
                  key={c}
                  style={{
                    textAlign: "left",
                    padding: "10px 14px",
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--text-muted)",
                    borderBottom: "1px solid var(--panel-border)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {toLabel(c)}
                </th>
              ))}
              <th style={{ width: 40, borderBottom: "1px solid var(--panel-border)" }} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  style={{
                    padding: "16px 14px",
                    textAlign: "center",
                    fontSize: 13,
                    fontStyle: "italic",
                    color: "var(--text-muted)",
                  }}
                >
                  No rows yet
                </td>
              </tr>
            ) : (
              rows.map((row, ri) => (
                <tr
                  key={ri}
                  className="ed-row"
                  style={{
                    borderBottom: ri < rows.length - 1 ? "1px solid var(--panel-border)" : "none",
                  }}
                >
                  {columns.map((c) => (
                    <td key={c} style={{ padding: 0 }}>
                      <input
                        type="text"
                        value={toInputString(row?.[c])}
                        placeholder="—"
                        onChange={(e) => onCellChange(ri, c, e.target.value)}
                        className={`ed-cell${isTotalKey(c) ? " ed-cell--total" : ""}`}
                      />
                    </td>
                  ))}
                  <td style={{ padding: "0 6px", textAlign: "center" }}>
                    <button
                      type="button"
                      onClick={() => onDeleteRow(ri)}
                      title="Delete row"
                      className="ed-del"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        border: "1px solid var(--panel-border)",
                        background: "var(--panel-bg)",
                        color: "#ef4444",
                        cursor: "pointer",
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div style={{ padding: "12px 14px" }}>
        <button
          type="button"
          onClick={onAddRow}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "7px 12px",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 7,
            border: "1px dashed var(--panel-border)",
            background: "var(--input-bg)",
            color: "var(--accent)",
            cursor: "pointer",
          }}
        >
          <Plus size={13} /> Add row
        </button>
      </div>
    </div>
  );
}

function tableColumns(rows) {
  const seen = new Set();
  const cols = [];
  for (const row of rows) {
    for (const k of Object.keys(row || {})) {
      if (!seen.has(k)) {
        seen.add(k);
        cols.push(k);
      }
    }
  }
  return cols;
}

/* ── Main editable view ──────────────────────────────────── */
export default function EditableResultView({ resultId, data, onSaved }) {
  const [draft, setDraft] = useState({});
  // Sections are open unless explicitly collapsed, so editing never reopens
  // what the user closed.
  const [closedSections, setClosedSections] = useState(() => new Set());
  const [page, setPage] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [invalidKeys, setInvalidKeys] = useState(() => new Set());
  // Snapshot of the last-saved fields, used to diff which fields a publish changed.
  const baselineRef = useRef({});

  const wrapped = isPlainObject(data?.formatted_result);

  useEffect(() => {
    // Re-seed the editable draft whenever the source document changes.
    const fields = unwrapFields(data);
    const seed = structuredClone(fields || {});
    setDraft(seed);
    baselineRef.current = structuredClone(seed);
    setPage(0);
    setDirty(false);
    setInvalidKeys(new Set());
  }, [data]);

  const multiMode = isMultiReceipt(draft);
  const totalPages = multiMode ? draft.multiple_receipts.length : 1;
  const safePage = Math.min(Math.max(0, page), Math.max(0, totalPages - 1));

  const viewFields = useMemo(
    () => (multiMode ? draft.multiple_receipts?.[safePage] || {} : draft),
    [draft, multiMode, safePage]
  );

  const published = !!draft._published;

  // Buckets matching the OCR RESULTS layout: flat fields, nested objects, and
  // array-of-objects tables.
  const { scalarEntries, objectEntries, tableEntries } = useMemo(() => {
    const entries = Object.entries(viewFields).filter(([k]) => !META_KEYS.has(k));
    return {
      scalarEntries: entries.filter(([k, v]) => !isTableEntry(k, v) && !isPlainObject(v)),
      objectEntries: entries.filter(([, v]) => isPlainObject(v)),
      tableEntries: entries.filter(([k, v]) => isTableEntry(k, v)),
    };
  }, [viewFields]);

  const isOpen = (id) => !closedSections.has(id);
  const toggleSection = (id) =>
    setClosedSections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  /* ── Mutators ── */
  function updateViewFields(mutator) {
    setDraft((prev) => {
      const clone = structuredClone(prev);
      const target = multiMode ? clone.multiple_receipts[safePage] : clone;
      mutator(target);
      return clone;
    });
    setDirty(true);
  }

  const setScalar = (key, raw) =>
    updateViewFields((t) => {
      t[key] = coerceValue(t[key], raw);
    });

  const setScalarJson = (key, parsed) =>
    updateViewFields((t) => {
      t[key] = parsed;
    });

  const setNested = (objKey, subKey, raw) =>
    updateViewFields((t) => {
      t[objKey] = { ...t[objKey], [subKey]: coerceValue(t[objKey]?.[subKey], raw) };
    });

  const setNestedJson = (objKey, subKey, parsed) =>
    updateViewFields((t) => {
      t[objKey] = { ...t[objKey], [subKey]: parsed };
    });

  const setCell = (arrKey, rowIdx, col, raw) =>
    updateViewFields((t) => {
      const rows = Array.isArray(t[arrKey]) ? [...t[arrKey]] : [];
      rows[rowIdx] = { ...rows[rowIdx], [col]: coerceValue(rows[rowIdx]?.[col], raw) };
      t[arrKey] = rows;
    });

  const addRow = (arrKey, columns) =>
    updateViewFields((t) => {
      t[arrKey] = [...(t[arrKey] || []), Object.fromEntries(columns.map((c) => [c, ""]))];
    });

  const deleteRow = (arrKey, rowIdx) =>
    updateViewFields((t) => {
      t[arrKey] = (t[arrKey] || []).filter((_, i) => i !== rowIdx);
    });

  const reportValidity = (key, valid) =>
    setInvalidKeys((prev) => {
      const next = new Set(prev);
      valid ? next.delete(key) : next.add(key);
      return next;
    });

  /* ── Persistence ── */
  function buildPayload(extraMeta) {
    const fields = structuredClone(draft);
    if (extraMeta) Object.assign(fields, extraMeta);
    return wrapped ? { ...data, formatted_result: fields } : fields;
  }

  async function publishResult() {
    if (!resultId) return;
    setPublishing(true);
    try {
      const meta = { _published: true, _published_at: new Date().toISOString() };
      const changes = computeChanges(baselineRef.current, draft);
      const res = await axios.post(
        `/api/document/${encodeURIComponent(resultId)}/update`,
        { result: buildPayload(meta), changes }
      );
      // Re-seed from what the server actually stored so the freshly-appended
      // audit entry (with the verified editor) shows up immediately.
      const stored = unwrapFields(res.data?.hitl_updated_result);
      if (stored && typeof stored === "object") {
        const seed = structuredClone(stored);
        setDraft(seed);
        baselineRef.current = structuredClone(seed);
      } else {
        setDraft((prev) => ({ ...prev, ...meta }));
        baselineRef.current = structuredClone(draft);
      }
      setDirty(false);
      toast.success("Published");
      onSaved?.(res.data);
    } catch (err) {
      console.error("Publish failed:", err);
      toast.error("Failed to publish");
    } finally {
      setPublishing(false);
    }
  }

  const hasInvalid = invalidKeys.size > 0;
  const busy = publishing;
  const isEmpty =
    scalarEntries.length === 0 && objectEntries.length === 0 && tableEntries.length === 0;
  // Publishing requires an existing hitl_updated_result to finalize. When the
  // source (data) is null/empty there is nothing to publish, so the button is
  // disabled.
  const sourceFields = unwrapFields(data);
  const sourceEmpty =
    !sourceFields ||
    typeof sourceFields !== "object" ||
    Object.keys(sourceFields).length === 0;
  const publishDisabled = busy || hasInvalid || sourceEmpty;

  /* Render one field within the OCR RESULTS grid — scalars get an input,
     arrays/empty-arrays fall back to an inline JSON editor. */
  const renderScalar = (key, value) => {
    if (Array.isArray(value)) {
      const vk = `arr:${key}`;
      return (
        <JsonField
          key={`${resultId}:${safePage}:${vk}`}
          fieldKey={key}
          value={value}
          validityKey={vk}
          onValidity={reportValidity}
          onChange={(parsed) => setScalarJson(key, parsed)}
        />
      );
    }
    return <FieldInput key={key} fieldKey={key} value={value} onChange={(raw) => setScalar(key, raw)} />;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <style>{EDITABLE_CSS}</style>

      {/* ── Action bar ── */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px",
          background: "var(--panel-bg)",
          border: "1px solid var(--panel-border)",
          borderRadius: 12,
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--foreground)",
          }}
        >
          Edit Result
        </span>

        {published && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 10.5,
              fontWeight: 700,
              padding: "3px 8px",
              borderRadius: 99,
              background: "var(--tag-green-bg)",
              color: "var(--tag-green-color)",
            }}
          >
            <CheckCircle2 size={12} /> Published
          </span>
        )}
        {hasInvalid ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              color: "#ef4444",
              fontWeight: 600,
            }}
          >
            <AlertTriangle size={12} /> Fix invalid JSON to save
          </span>
        ) : (
          dirty && (
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
              Unsaved changes
            </span>
          )
        )}

        <div style={{ flex: 1 }} />

        <button
          type="button"
          onClick={publishResult}
          disabled={publishDisabled}
          title={sourceEmpty ? "No HITL-updated result to publish" : undefined}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 700,
            borderRadius: 8,
            border: "none",
            background: "var(--accent)",
            color: "#fff",
            cursor: publishDisabled ? "not-allowed" : "pointer",
            opacity: publishDisabled ? 0.6 : 1,
          }}
        >
          <UploadCloud size={14} /> {publishing ? "Publishing…" : "Publish"}
        </button>
      </div>

      {/* ── Multi-receipt pager ── */}
      {multiMode && totalPages > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "8px 16px",
            background: "var(--panel-bg)",
            border: "1px solid var(--panel-border)",
            borderRadius: 12,
          }}
        >
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "6px 10px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid var(--panel-border)",
              background: "var(--input-bg)",
              color: "var(--foreground)",
              cursor: safePage === 0 ? "not-allowed" : "pointer",
              opacity: safePage === 0 ? 0.4 : 1,
            }}
          >
            <ChevronLeft size={14} /> Prev
          </button>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
            Receipt {safePage + 1} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={safePage >= totalPages - 1}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "6px 10px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid var(--panel-border)",
              background: "var(--input-bg)",
              color: "var(--foreground)",
              cursor: safePage >= totalPages - 1 ? "not-allowed" : "pointer",
              opacity: safePage >= totalPages - 1 ? 0.4 : 1,
            }}
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}

      {isEmpty && (
        <div
          style={{
            padding: 24,
            textAlign: "center",
            color: "var(--text-muted)",
            background: "var(--panel-bg)",
            border: "1px dashed var(--panel-border)",
            borderRadius: 12,
            fontSize: 13,
          }}
        >
          No editable fields available
        </div>
      )}

      {/* ── OCR Results card: flat fields + nested objects ── */}
      {(scalarEntries.length > 0 || objectEntries.length > 0) && (
        <SectionCard
          id="ocr"
          title="OCR Results"
          icon={<Database size={12} style={{ color: "var(--accent)" }} />}
          open={isOpen("ocr")}
          onToggle={toggleSection}
        >
          <div style={{ padding: "22px 26px", ...FIELD_GRID }}>
            {scalarEntries.map(([key, value]) => (
              <div
                key={key}
                style={{ gridColumn: isLongValue(value) || Array.isArray(value) ? "1 / -1" : "auto" }}
              >
                {renderScalar(key, value)}
              </div>
            ))}

            {/* Nested objects rendered inline as labeled sub-grids */}
            {objectEntries.map(([objKey, obj]) => {
              const subEntries = Object.entries(obj).filter(([k]) => !META_KEYS.has(k));
              return (
                <div
                  key={objKey}
                  style={{
                    gridColumn: "1 / -1",
                    borderTop: "1px dashed var(--panel-border)",
                    paddingTop: 16,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--text-muted)",
                    }}
                  >
                    {toLabel(objKey)}
                  </span>
                  <div style={FIELD_GRID}>
                    {subEntries.map(([sk, sv]) => {
                      const complex = typeof sv === "object" && sv !== null;
                      const vk = `obj:${objKey}.${sk}`;
                      return (
                        <div
                          key={sk}
                          style={{ gridColumn: complex || isLongValue(sv) ? "1 / -1" : "auto" }}
                        >
                          {complex ? (
                            <JsonField
                              key={`${resultId}:${safePage}:${vk}`}
                              fieldKey={sk}
                              value={sv}
                              validityKey={vk}
                              onValidity={reportValidity}
                              onChange={(parsed) => setNestedJson(objKey, sk, parsed)}
                            />
                          ) : (
                            <FieldInput
                              fieldKey={sk}
                              value={sv}
                              onChange={(raw) => setNested(objKey, sk, raw)}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* ── One card per items table ── */}
      {tableEntries.map(([arrKey, value]) => {
        const id = `table:${arrKey}`;
        const rows = Array.isArray(value) ? value : [];
        const columns = columnsFor(arrKey, rows);
        return (
          <SectionCard
            key={id}
            id={id}
            title={toLabel(arrKey)}
            icon={<ListOrdered size={12} style={{ color: "var(--accent)" }} />}
            count={rows.length}
            open={isOpen(id)}
            onToggle={toggleSection}
          >
            <EditableItemsTable
              rows={rows}
              columns={columns}
              onCellChange={(ri, col, raw) => setCell(arrKey, ri, col, raw)}
              onAddRow={() => addRow(arrKey, columns)}
              onDeleteRow={(ri) => deleteRow(arrKey, ri)}
            />
          </SectionCard>
        );
      })}
    </div>
  );
}

/* ── Edit history / audit trail — rendered separately so it can sit after the
   JSON panels in the analyzer page. ── */
export function EditHistory({ data }) {
  const [open, setOpen] = useState(true);
  const fields = unwrapFields(data);
  const auditLog = Array.isArray(fields?._audit) ? fields._audit : [];

  if (auditLog.length === 0) return null;

  return (
    <div
      style={{
        flexShrink: 0,
        width: "100%",
        borderTop: "1px solid var(--panel-border)",
        background: "var(--background)",
        padding: "18px 32px",
      }}
    >
      <SectionCard
        id="audit"
        title="Edit History"
        icon={<History size={12} style={{ color: "var(--accent)" }} />}
        count={auditLog.length}
        open={open}
        onToggle={() => setOpen((v) => !v)}
      >
      <div style={{ display: "flex", flexDirection: "column" }}>
        {[...auditLog].reverse().map((entry, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 12,
              padding: "12px 18px",
              borderBottom: i < auditLog.length - 1 ? "1px solid var(--panel-border)" : "none",
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: "var(--tag-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <UserIcon size={14} style={{ color: "var(--accent)" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
                  {entry.by || "Unknown user"}
                </span>
                {Array.isArray(entry.roles) && entry.roles.length > 0 && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 7px",
                      borderRadius: 99,
                      background: "var(--tag-purple-bg)",
                      color: "var(--tag-purple-color)",
                    }}
                  >
                    {entry.roles.join(", ")}
                  </span>
                )}
                <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                  {formatTimestamp(entry.at)}
                </span>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4 }}>
                {entry.fields && entry.fields.length > 0 ? (
                  <span>
                    Changed:{" "}
                    <span style={{ color: "var(--foreground)" }}>
                      {entry.fields.join(", ")}
                    </span>
                  </span>
                ) : (
                  "Published (no field changes)"
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      </SectionCard>
    </div>
  );
}
