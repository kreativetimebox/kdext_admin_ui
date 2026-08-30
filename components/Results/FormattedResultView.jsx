"use client";

import { memo, useMemo } from "react";
import { Database, ListOrdered, Download } from "lucide-react";
import { rowsToCsv } from "@/lib/csv";

/* ── Helpers ─────────────────────────────────────────────── */

function toLabel(key) {
  return String(key)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isEmptyValue(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    return t === "" || t === "null" || t === "n/a" || t === "na";
  }
  return false;
}

function displayScalar(v) {
  if (isEmptyValue(v)) return "—";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
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

/* Total amount field detection — these get a green accent in the summary */
const TOTAL_KEYS = new Set([
  "totalamount",
  "total_amount",
  "total",
  "grandtotal",
  "grand_total",
  "amountdue",
  "amount_due",
]);

function isTotalKey(key) {
  const normalized = String(key).toLowerCase().replace(/[^a-z]/g, "");
  return TOTAL_KEYS.has(normalized) || TOTAL_KEYS.has(String(key).toLowerCase());
}

/* Field that should span the full row (long values) */
function isLongValue(v) {
  return typeof v === "string" && v.length > 60;
}

/* Pull a sensible flat field object from however the result is stored. */
function unwrapFields(data) {
  if (!data || typeof data !== "object") return null;
  if (isPlainObject(data.formatted_result)) return data.formatted_result;
  return data;
}

/* Receipts pipeline can wrap multiple receipts in an array */
function isMultiReceipt(fields) {
  return (
    fields &&
    Array.isArray(fields.multiple_receipts) &&
    fields.multiple_receipts.length > 0
  );
}

/* Download the rows of one items table as CSV. Header row uses the raw
   JSON keys (e.g. "unit_price"), not the prettified display labels. */
function downloadTableCsv(requestId, arrKey, rows, columns) {
  const csvColumns = columns.map((c) => ({ key: c, label: c }));
  const csv = rowsToCsv(rows, csvColumns);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${requestId || arrKey || "table"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Sub-components ──────────────────────────────────────── */

function FieldCell({ fieldKey, value, accent }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span
        style={{
          fontSize: 11.5,
          fontWeight: 500,
          color: "var(--text-muted)",
          letterSpacing: "0.01em",
        }}
      >
        {toLabel(fieldKey)}
      </span>
      <span
        style={{
          fontSize: 14.5,
          fontWeight: 700,
          color: accent
            ? "var(--tag-green-color)"
            : isEmptyValue(value)
            ? "var(--text-muted)"
            : "var(--foreground)",
          fontFamily: isEmptyValue(value)
            ? undefined
            : "ui-monospace, SFMono-Regular, monospace",
          letterSpacing: "0.01em",
          wordBreak: "break-word",
        }}
      >
        {displayScalar(value)}
      </span>
    </div>
  );
}

function ItemsTable({ rows, title, requestId }) {
  const columns = useMemo(() => {
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
  }, [rows]);

  if (columns.length === 0) return null;

  return (
    <div
      style={{
        background: "var(--panel-bg)",
        border: "1px solid var(--panel-border)",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 18px",
          borderBottom: "1px solid var(--panel-border)",
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
          }}
        >
          <ListOrdered size={12} style={{ color: "var(--accent)" }} />
        </div>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-muted)",
          }}
        >
          {toLabel(title)} ({rows.length})
        </span>

        <button
          type="button"
          onClick={() => downloadTableCsv(requestId, title, rows, columns)}
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "6px 11px",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 7,
            border: "1px solid var(--panel-border)",
            background: "var(--input-bg)",
            color: "var(--foreground)",
            cursor: "pointer",
          }}
        >
          <Download size={13} /> Export CSV
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
          }}
        >
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
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr
                key={ri}
                style={{
                  borderBottom:
                    ri < rows.length - 1
                      ? "1px solid var(--panel-border)"
                      : "none",
                }}
              >
                {columns.map((c) => {
                  const v = row?.[c];
                  const empty = isEmptyValue(v);
                  const isTotal = isTotalKey(c);
                  return (
                    <td
                      key={c}
                      style={{
                        padding: "10px 14px",
                        fontSize: 13,
                        color: empty
                          ? "var(--text-muted)"
                          : isTotal
                          ? "var(--tag-green-color)"
                          : "var(--foreground)",
                        fontWeight: isTotal ? 600 : 400,
                        fontFamily: empty
                          ? undefined
                          : "ui-monospace, SFMono-Regular, monospace",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {empty ? "null" : displayScalar(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Main view ──────────────────────────────────────────── */

function FormattedResultView({ data, title = "Formatted Result", requestId }) {
  const fields = unwrapFields(data);

  if (!fields || Object.keys(fields).length === 0) {
    return (
      <div
        style={{
          padding: "36px 24px",
          textAlign: "center",
          color: "var(--text-muted)",
          background: "var(--panel-bg)",
          border: "1px dashed var(--panel-border)",
          borderRadius: 12,
          fontSize: 13,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <Database size={24} style={{ opacity: 0.4 }} />
        <p style={{ fontWeight: 600, color: "var(--foreground)", margin: 0 }}>
          No structured data extracted
        </p>
        <p style={{ fontSize: 12, margin: 0, maxWidth: 420 }}>
          This document does not contain extracted financial fields (e.g. invalid document, processing failed, or non-financial file).
        </p>
      </div>
    );
  }

  if (isMultiReceipt(fields)) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {fields.multiple_receipts.map((receipt, i) => (
          <FormattedResultView
            key={i}
            data={receipt}
            title={`Receipt ${i + 1}`}
            requestId={requestId}
          />
        ))}
      </div>
    );
  }

  const entries = Object.entries(fields);

  const scalarEntries = entries.filter(
    ([, v]) => !isArrayOfObjects(v) && !isPlainObject(v)
  );
  const arrayEntries = entries.filter(([, v]) => isArrayOfObjects(v));
  const objectEntries = entries.filter(
    ([, v]) => isPlainObject(v) && !isArrayOfObjects(v)
  );

  const longScalars = scalarEntries.filter(([, v]) => isLongValue(v));
  const shortScalars = scalarEntries.filter(([, v]) => !isLongValue(v));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Summary card */}
      <div
        style={{
          background: "var(--panel-bg)",
          border: "1px solid var(--panel-border)",
          borderRadius: 12,
          boxShadow: "var(--shadow-sm)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 18px",
            borderBottom: "1px solid var(--panel-border)",
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
            }}
          >
            <Database size={12} style={{ color: "var(--accent)" }} />
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--foreground)",
            }}
          >
            {title}
          </span>
        </div>

        <div
          style={{
            padding: "22px 26px",
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            columnGap: 32,
            rowGap: 20,
          }}
        >
          {shortScalars.map(([k, v]) => (
            <FieldCell
              key={k}
              fieldKey={k}
              value={v}
              accent={isTotalKey(k)}
            />
          ))}

          {longScalars.map(([k, v]) => (
            <div key={k} style={{ gridColumn: "1 / -1" }}>
              <FieldCell fieldKey={k} value={v} accent={isTotalKey(k)} />
            </div>
          ))}

          {/* Nested objects: render as full-width sub-grid */}
          {objectEntries.map(([k, v]) => {
            const subEntries = Object.entries(v);
            if (subEntries.length === 0) return null;
            return (
              <div
                key={k}
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
                  {toLabel(k)}
                </span>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    columnGap: 32,
                    rowGap: 16,
                  }}
                >
                  {subEntries.map(([sk, sv]) => (
                    <FieldCell
                      key={sk}
                      fieldKey={sk}
                      value={sv}
                      accent={isTotalKey(sk)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Items tables (one per array-of-objects field) */}
      {arrayEntries.map(([k, rows]) => (
        <ItemsTable key={k} rows={rows} title={k} requestId={requestId} />
      ))}
    </div>
  );
}

export default memo(FormattedResultView);
