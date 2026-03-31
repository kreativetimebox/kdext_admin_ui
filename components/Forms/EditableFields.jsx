"use client";

import { useState, useEffect, memo, useCallback } from "react";
import { Save, Loader2, RotateCcw, Plus, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import axios from "axios";

/* ── Keys rendered as a structured table (any array-of-objects) ── */
function isArrayOfObjects(val) {
  return Array.isArray(val) && val.length > 0 && typeof val[0] === "object" && val[0] !== null;
}

/* ── Normalise string "null" / null / undefined → "" for display ── */
function displayValue(val) {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") {
    const t = val.trim().toLowerCase();
    if (t === "null" || t === "n/a" || t === "na") return "";
  }
  if (typeof val === "object") return JSON.stringify(val, null, 2);
  return String(val);
}

/* ── Field section grouping ── */
const FIELD_GROUPS = [
  { label: "Supplier Info", keys: ["supplier", "vendor", "customer", "vat_number", "vatnumber", "email", "phone", "website", "address"] },
  { label: "Transaction", keys: ["receipt_number", "invoice_number", "order_number", "ordernumber", "invoice_id", "documentid", "document_id", "date", "due_date", "duedate", "payment", "card", "currency"] },
  { label: "Amounts", keys: ["subtotal", "total_amount", "totalamount", "total", "net", "tax", "gross", "discount", "amount", "amounts"] },
  { label: "VAT & Items", keys: ["vat_information", "vat_info", "vat_amount", "vat_rate", "vat_code", "tableitems", "table_items", "items", "line_items"] },
];

const PAIR_KEYS = [
  ["payment_method", "card_type"],
  ["payment", "card_type"],
];

function groupFields(keys) {
  const assigned = new Set();
  const groups = FIELD_GROUPS.map((g) => {
    const matched = keys.filter((k) => {
      if (assigned.has(k)) return false;
      return g.keys.some((gk) => k.toLowerCase() === gk || k.toLowerCase().includes(gk));
    });
    matched.forEach((k) => assigned.add(k));
    return { label: g.label, keys: matched };
  }).filter((g) => g.keys.length > 0);
  const rest = keys.filter((k) => !assigned.has(k));
  if (rest.length > 0) groups.push({ label: "Details", keys: rest });
  return groups;
}

function isPairStart(key, allKeys) {
  return PAIR_KEYS.some(([a, b]) => {
    const ka = allKeys.find((k) => k.toLowerCase().includes(a));
    const kb = allKeys.find((k) => k.toLowerCase().includes(b));
    return ka === key && kb && allKeys.includes(kb);
  });
}

function getPairEnd(key, allKeys) {
  for (const [a, b] of PAIR_KEYS) {
    const ka = allKeys.find((k) => k.toLowerCase().includes(a));
    const kb = allKeys.find((k) => k.toLowerCase().includes(b));
    if (ka === key && kb) return kb;
  }
  return null;
}

function isPairEndKey(key, allKeys) {
  return PAIR_KEYS.some(([a, b]) => {
    const ka = allKeys.find((k) => k.toLowerCase().includes(a));
    const kb = allKeys.find((k) => k.toLowerCase().includes(b));
    return kb === key && ka && allKeys.includes(ka);
  });
}

/* ── Coerce edited string values back to their original types ── */
function coerceToOriginalType(newVal, originalVal) {
  if (typeof newVal !== "string") return newVal;
  const trimmed = newVal.trim();

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try { return JSON.parse(trimmed); } catch { /* keep as string */ }
  }

  if (trimmed === "") {
    const origWasNull = originalVal === null || originalVal === undefined;
    const origWasNullStr = typeof originalVal === "string" && originalVal.trim().toLowerCase() === "null";
    if (origWasNull || origWasNullStr) return null;
  }
  if (trimmed.toLowerCase() === "null") return null;

  if (typeof originalVal === "number" && trimmed !== "") {
    const num = Number(trimmed);
    if (!isNaN(num) && isFinite(num)) return num;
  }

  if (typeof originalVal === "boolean") {
    if (trimmed.toLowerCase() === "true") return true;
    if (trimmed.toLowerCase() === "false") return false;
  }

  return newVal;
}

/* ── Skeleton ── */
function EditableFieldSkeleton() {
  return (
    <div className="flex flex-col gap-5 p-6">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="skeleton h-3 w-24 rounded" />
          <div className="skeleton h-10 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

function toLabel(key) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeDocType(docType = "") {
  const raw = String(docType || "").toLowerCase();
  return {
    raw,
    compact: raw.replace(/[^a-z]/g, ""),
    isReceipt: raw.includes("receipt"),
    isInvoice: raw.includes("invoice"),
    isSale: raw.includes("sale"),
    isPurchase: raw.includes("purchase"),
    isBankStatement: raw.includes("bank statement") || raw.replace(/[^a-z]/g, "").includes("bankstatement"),
  };
}

function getMandatoryKeySet(docType = "") {
  const type = normalizeDocType(docType);

  if (type.isBankStatement) {
    return new Set([
      "documentid", "document_id",
      "bankname", "bank_name",
      "accountholdername", "account_holder_name",
      "openingdate", "opening_date",
      "closingdate", "closing_date",
      "openingbalance", "opening_balance",
      "closingbalance", "closing_balance",
      "currencycode", "currency",
      "tableitems", "table_items", "items",
    ]);
  }

  if (type.isReceipt) {
    return new Set([
      // Identity
      "document_id", "documentid",
      // Parties
      "supplier_name", "suppliername",
      "customer_name", "customername",
      // Date
      "receipt_date", "date",
      // Currency
      "currency", "currencycode",
      // Amounts
      "total_amount", "totalamount",
      "net_amount", "netamount",
      "tax_amount", "taxamount",
      "discount_amount", "discountamount",
      // Line items
      "items", "tableitems", "table_items",
    ]);
  }

  if (type.isInvoice) {
    return new Set([
      // Identity
      "documentid", "document_id",
      // Parties
      "suppliername", "supplier_name",
      "customername", "customer_name",
      // Dates
      "date", "invoice_date",
      "duedate", "due_date",
      // Currency
      "currencycode", "currency",
      // Amounts
      "totalamount", "total_amount",
      "taxamount", "tax_amount",
      "netamount", "net_amount",
      "discountamount", "discount_amount",
      // Line items
      "tableitems", "table_items", "items",
    ]);
  }

  const keys = new Set([
    "documentid", "date", "duedate", "currencycode",
    "totalamount", "netamount", "taxamount", "discountamount",
    "tableitems", "items",
  ]);
  if (type.isSale) keys.add("customername");
  if (type.isPurchase) keys.add("suppliername");
  return keys;
}

function isMandatoryFieldKey(fieldKey, docType = "") {
  const normalized = String(fieldKey || "").toLowerCase();
  const compact = normalized.replace(/[^a-z0-9_]/g, "").replace(/_/g, "");
  const mandatory = getMandatoryKeySet(docType);
  if (mandatory.has(normalized)) return true;
  if (mandatory.has(compact)) return true;
  return false;
}

/* ── Generic Array-of-Objects Table Editor ─────────────────── */
function discoverColumns(rows) {
  const seen = new Set();
  const cols = [];
  for (const row of rows) {
    for (const k of Object.keys(row || {})) {
      if (!seen.has(k)) { seen.add(k); cols.push(k); }
    }
  }
  return cols;
}

function normalizeRows(rawRows) {
  if (Array.isArray(rawRows)) return rawRows;
  if (typeof rawRows === "string") {
    try { return JSON.parse(rawRows); } catch { return []; }
  }
  return [];
}

function ArrayTableEditor({ fieldKey, items, onChange, isMandatory }) {
  const rows = normalizeRows(items);
  const columns = discoverColumns(rows);

  function updateCell(rowIdx, colKey, val) {
    const updated = rows.map((r, i) =>
      i === rowIdx ? { ...r, [colKey]: val } : r
    );
    onChange(fieldKey, updated);
  }

  function addRow() {
    const empty = {};
    columns.forEach((c) => { empty[c] = ""; });
    onChange(fieldKey, [...rows, empty]);
  }

  function removeRow(rowIdx) {
    onChange(fieldKey, rows.filter((_, i) => i !== rowIdx));
  }

  const colCount = columns.length;
  const gridCols = colCount > 0
    ? `repeat(${colCount}, minmax(0, 1fr)) 36px`
    : "1fr";

  const inputStyle = {
    width: "100%",
    padding: "6px 8px",
    fontSize: 13,
    borderRadius: 6,
    border: "1px solid var(--input-border)",
    background: "var(--input-bg)",
    color: "var(--foreground)",
    outline: "none",
    minWidth: 0,
  };

  return (
    <div className="flex flex-col gap-3">
      <label
        className="text-[13px] font-semibold uppercase tracking-wider pl-1"
        style={{ color: "var(--text-muted)" }}
      >
        {toLabel(fieldKey)}
        {isMandatory && <span style={{ color: "#ef4444", marginLeft: 4 }}>*</span>}
      </label>

      <div style={{ border: "1px solid var(--panel-border)", borderRadius: 10, overflow: "hidden" }}>
        {/* Header */}
        {columns.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: gridCols,
              gap: 6,
              padding: "8px 10px",
              background: "var(--input-bg)",
              borderBottom: "1px solid var(--panel-border)",
            }}
          >
            {columns.map((c) => (
              <span
                key={c}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--text-muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {toLabel(c)}
              </span>
            ))}
            <span />
          </div>
        )}

        {/* Rows */}
        {rows.length === 0 ? (
          <div style={{ padding: "18px 12px", textAlign: "center", fontSize: 13, color: "var(--text-muted)", fontStyle: "italic" }}>
            No items — click + Add Row
          </div>
        ) : (
          rows.map((row, rowIdx) => (
            <div
              key={rowIdx}
              style={{
                display: "grid",
                gridTemplateColumns: gridCols,
                gap: 6,
                padding: "6px 10px",
                borderBottom: rowIdx < rows.length - 1 ? "1px solid var(--panel-border)" : "none",
                alignItems: "center",
              }}
            >
              {columns.map((col) => (
                <input
                  key={col}
                  type="text"
                  value={displayValue(row[col])}
                  placeholder={toLabel(col)}
                  onChange={(e) => updateCell(rowIdx, col, e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "var(--input-border)"; }}
                />
              ))}
              <button
                type="button"
                onClick={() => removeRow(rowIdx)}
                title="Remove row"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 28, height: 28, borderRadius: 6, border: "none",
                  background: "transparent", color: "#ef4444", cursor: "pointer", flexShrink: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}

        {/* Add row footer */}
        <button
          type="button"
          onClick={addRow}
          style={{
            display: "flex", alignItems: "center", gap: 6, width: "100%",
            padding: "8px 12px", fontSize: 12, fontWeight: 600,
            color: "var(--accent)", background: "transparent", border: "none",
            borderTop: rows.length > 0 ? "1px dashed var(--panel-border)" : "none",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <Plus size={13} />
          Add Row
        </button>
      </div>
    </div>
  );
}

/* ── Single flat field ── */
function FieldInput({ fieldKey, value, onChange, isMandatory = false }) {
  const isObj = typeof value === "object" && value !== null && !Array.isArray(value);
  const rawStr = displayValue(value);
  const isLong = !isObj && rawStr.length > 100;

  if (isObj || isLong) {
    return (
      <div className="flex flex-col gap-2.5">
        <label className="text-[13px] font-semibold uppercase tracking-wider pl-1" style={{ color: "var(--text-muted)" }}>
          {toLabel(fieldKey)}
          {isMandatory && <span style={{ color: "#ef4444", marginLeft: 4 }}>*</span>}
        </label>
        <textarea
          value={rawStr}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          rows={4}
          className="w-full px-5 py-4 text-[14px] rounded-lg border transition-all resize-y font-mono overflow-y-auto"
          style={{
            background: "var(--input-bg)",
            borderColor: "var(--input-border)",
            color: "var(--foreground)",
            minHeight: "5rem", maxHeight: "14rem",
            outline: "none",
          }}
          onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; }}
          onBlur={(e) => { e.target.style.borderColor = "var(--input-border)"; }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <label className="text-[13px] font-semibold uppercase tracking-wider pl-1" style={{ color: "var(--text-muted)" }}>
        {toLabel(fieldKey)}
        {isMandatory && <span style={{ color: "#ef4444", marginLeft: 4 }}>*</span>}
      </label>
      <input
        type="text"
        value={rawStr}
        onChange={(e) => onChange(fieldKey, e.target.value)}
        className="w-full h-12 px-5 text-[15px] rounded-lg border transition-all"
        style={{
          background: "var(--input-bg)",
          borderColor: "var(--input-border)",
          color: "var(--foreground)",
          outline: "none",
        }}
        onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; }}
        onBlur={(e) => { e.target.style.borderColor = "var(--input-border)"; }}
      />
    </div>
  );
}

/* ── Main component ── */
function EditableFields({ document, isLoading }) {
  const [fields, setFields] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Helper: pick the flat fields object from however the result is stored.
    // New pipeline wraps results as { status, formatted_result: { ... } }.
    // Old pipeline stores the flat object directly.
    function extractFields(src) {
      if (!src || typeof src !== "object") return null;
      if (src.formatted_result && typeof src.formatted_result === "object") {
        return src.formatted_result;
      }
      return src;
    }

    const uiSrc = extractFields(document?.ocr_ui_results);
    if (uiSrc && Object.keys(uiSrc).length > 0) {
      setFields(uiSrc);
      return;
    }

    const ocrSrc = extractFields(document?.ocr_results);
    if (ocrSrc && Object.keys(ocrSrc).length > 0) {
      setFields(ocrSrc);
      return;
    }

    setFields({});
  }, [document]);

  const handleChange = useCallback((key, value) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = async () => {
    if (!document?.id) return;
    setIsSaving(true);
    try {
      // Resolve the original flat fields for type-coercion hints
      const rawUi = document?.ocr_ui_results ?? document?.ocr_results ?? {};
      const original = (rawUi.formatted_result && typeof rawUi.formatted_result === "object")
        ? rawUi.formatted_result
        : rawUi;

      const parsed = {};
      for (const [key, val] of Object.entries(fields)) {
        if (isArrayOfObjects(val)) {
          const origRows = Array.isArray(original[key]) ? original[key] : [];
          parsed[key] = val.map((row, ri) => {
            const origRow = origRows[ri] ?? {};
            const coercedRow = {};
            for (const [ck, cv] of Object.entries(row)) {
              coercedRow[ck] = coerceToOriginalType(cv, origRow[ck]);
            }
            return coercedRow;
          });
        } else {
          parsed[key] = coerceToOriginalType(val, original[key]);
        }
      }

      const { data } = await axios.post(`/api/document/${document.id}/update`, parsed);

      // Unwrap the returned data the same way
      const returnedUi = data?.ocr_ui_results;
      const returnedFields = (returnedUi?.formatted_result && typeof returnedUi.formatted_result === "object")
        ? returnedUi.formatted_result
        : (typeof returnedUi === "object" && returnedUi ? returnedUi : null);

      if (returnedFields && Object.keys(returnedFields).length > 0) {
        setFields(returnedFields);
      } else {
        setFields(parsed);
      }

      queryClient.invalidateQueries({ queryKey: ["document", document.id] });
      toast.success("Saved successfully");
    } catch (err) {
      console.error("Save error:", err);

      toast.error(err?.response?.data?.error || "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <EditableFieldSkeleton />;

  const docType = document?.ocr_document_type || "";
  const allKeys = Object.keys(fields);
  const mandatoryKeys = allKeys.filter((key) => isMandatoryFieldKey(key, docType));

  // Split: array-of-objects → table editor; everything else → flat input
  const tableKeys = mandatoryKeys.filter((k) => isArrayOfObjects(fields[k]));
  const flatKeys = mandatoryKeys.filter((k) => !isArrayOfObjects(fields[k]));

  return (
    <div className="flex flex-col">
      {mandatoryKeys.length === 0 ? (
        <div className="px-5 py-6 text-center">
          <p className="text-sm text-[var(--text-muted)] italic">
            No mandatory editable fields available for this document.
          </p>
        </div>
      ) : (
        <>
          {/* Flat fields */}
          {flatKeys.length > 0 && (
            <div>
              {groupFields(flatKeys).map((group, gi) => (
                <div
                  key={group.label}
                  className={gi > 0 ? "border-t" : ""}
                  style={{ borderColor: "var(--panel-border)" }}
                >
                  <div className="flex flex-col gap-6 px-8 py-6">
                    {group.keys.map((key) => {
                      if (isPairEndKey(key, group.keys)) return null;
                      if (isPairStart(key, group.keys)) {
                        const partnerKey = getPairEnd(key, group.keys);
                        return (
                          <div key={key} className="grid grid-cols-2 gap-4">
                            <FieldInput
                              fieldKey={key}
                              value={fields[key]}
                              onChange={handleChange}
                              isMandatory={isMandatoryFieldKey(key, docType)}
                            />
                            {partnerKey && (
                              <FieldInput
                                fieldKey={partnerKey}
                                value={fields[partnerKey]}
                                onChange={handleChange}
                                isMandatory={isMandatoryFieldKey(partnerKey, docType)}
                              />
                            )}
                          </div>
                        );
                      }
                      return (
                        <FieldInput
                          key={key}
                          fieldKey={key}
                          value={fields[key]}
                          onChange={handleChange}
                          isMandatory={isMandatoryFieldKey(key, docType)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Array-of-objects table editors */}
          {tableKeys.length > 0 && (
            <div
              className={flatKeys.length > 0 ? "border-t" : ""}
              style={{ borderColor: "var(--panel-border)" }}
            >
              <div className="flex flex-col gap-8 px-8 py-6">
                {tableKeys.map((key) => (
                  <ArrayTableEditor
                    key={key}
                    fieldKey={key}
                    items={fields[key]}
                    onChange={handleChange}
                    isMandatory={isMandatoryFieldKey(key, docType)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Save / Reset buttons */}
          <div
            className="flex items-center justify-center gap-5 px-8 py-6 border-t"
            style={{ borderColor: "var(--panel-border)", background: "var(--panel-bg)" }}
          >
            <button
              type="button"
              className="flex items-center justify-center gap-3 rounded-xl text-lg font-medium transition-colors"
              style={{
                background: "var(--input-bg)", color: "var(--text-muted)",
                border: "1px solid var(--panel-border)", minWidth: "160px", minHeight: "52px", padding: "14px 32px",
              }}
              onClick={() => {
                const src = document?.ocr_ui_results ?? document?.ocr_results;
                if (src) setFields(src);
              }}
            >
              <RotateCcw size={18} />
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !document?.id}
              className="flex items-center justify-center gap-3 rounded-xl text-lg font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: isSaving ? "var(--text-muted)" : "var(--accent)",
                minWidth: "180px", minHeight: "52px", padding: "14px 36px",
              }}
            >
              {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              {isSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default memo(EditableFields);
