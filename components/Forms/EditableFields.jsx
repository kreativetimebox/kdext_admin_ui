"use client";

import { useState, useEffect, memo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

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

/* ── Generic Array-of-Objects Table (read-only) ─────────────── */
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

function ArrayTable({ fieldKey, items, isMandatory }) {
  const rows = normalizeRows(items);
  const columns = discoverColumns(rows);

  const colCount = columns.length;
  const gridCols = colCount > 0 ? `repeat(${colCount}, minmax(0, 1fr))` : "1fr";

  const cellStyle = {
    fontSize: 13,
    padding: "6px 8px",
    color: "var(--foreground)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
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
          </div>
        )}

        {/* Rows */}
        {rows.length === 0 ? (
          <div style={{ padding: "18px 12px", textAlign: "center", fontSize: 13, color: "var(--text-muted)", fontStyle: "italic" }}>
            No items
          </div>
        ) : (
          rows.map((row, rowIdx) => (
            <div
              key={rowIdx}
              style={{
                display: "grid",
                gridTemplateColumns: gridCols,
                gap: 6,
                padding: "2px 10px",
                borderBottom: rowIdx < rows.length - 1 ? "1px solid var(--panel-border)" : "none",
                alignItems: "center",
              }}
            >
              {columns.map((col) => (
                <span key={col} style={cellStyle} title={displayValue(row[col])}>
                  {displayValue(row[col]) || "—"}
                </span>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ── Single flat field (read-only) ── */
function FieldDisplay({ fieldKey, value, isMandatory = false }) {
  const isObj = typeof value === "object" && value !== null && !Array.isArray(value);
  const rawStr = displayValue(value);
  const isLong = !isObj && rawStr.length > 100;
  const isMultiline = isObj || isLong;

  return (
    <div className="flex flex-col gap-2.5">
      <label className="text-[13px] font-semibold uppercase tracking-wider pl-1" style={{ color: "var(--text-muted)" }}>
        {toLabel(fieldKey)}
        {isMandatory && <span style={{ color: "#ef4444", marginLeft: 4 }}>*</span>}
      </label>
      <div
        className={
          isMultiline
            ? "w-full px-5 py-4 text-[14px] rounded-lg border font-mono whitespace-pre-wrap break-words overflow-y-auto"
            : "w-full min-h-12 px-5 py-3 text-[15px] rounded-lg border break-words"
        }
        style={{
          background: "var(--input-bg)",
          borderColor: "var(--input-border)",
          color: rawStr ? "var(--foreground)" : "var(--text-muted)",
          maxHeight: isMultiline ? "14rem" : undefined,
        }}
      >
        {rawStr || "—"}
      </div>
    </div>
  );
}

/* ── Helper: pick the flat fields object from however the result is stored.
   New pipeline wraps results as { status, formatted_result: { ... } }.
   Old pipeline stores the flat object directly. */
function extractFields(src) {
  if (!src || typeof src !== "object") return null;
  if (src.formatted_result && typeof src.formatted_result === "object") {
    return src.formatted_result;
  }
  return src;
}

function isMultiReceipt(fields) {
  const arr = fields?.multiple_receipts;
  return Array.isArray(arr) && arr.length > 0 && arr.every((r) => r && typeof r === "object" && !Array.isArray(r));
}

/* ── Main component (read-only) ── */
function EditableFields({ document, isLoading }) {
  const [fields, setFields] = useState({});
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    const uiSrc = extractFields(document?.ocr_ui_results);
    if (uiSrc && Object.keys(uiSrc).length > 0) {
      setFields(uiSrc);
      setCurrentPage(0);
      return;
    }

    const ocrSrc = extractFields(document?.ocr_results);
    if (ocrSrc && Object.keys(ocrSrc).length > 0) {
      setFields(ocrSrc);
      setCurrentPage(0);
      return;
    }

    setFields({});
    setCurrentPage(0);
  }, [document]);

  const multiMode = isMultiReceipt(fields);
  const totalPages = multiMode ? fields.multiple_receipts.length : 1;
  const safePage = Math.min(Math.max(0, currentPage), Math.max(0, totalPages - 1));

  useEffect(() => {
    if (currentPage !== safePage) setCurrentPage(safePage);
  }, [currentPage, safePage]);

  const viewFields = multiMode ? (fields.multiple_receipts[safePage] || {}) : fields;

  if (isLoading) return <EditableFieldSkeleton />;

  const docType = document?.ocr_document_type || "";
  const allKeys = Object.keys(viewFields);
  const mandatoryKeys = allKeys.filter((key) => isMandatoryFieldKey(key, docType));

  // Split: array-of-objects → table view; everything else → flat display
  const tableKeys = mandatoryKeys.filter((k) => isArrayOfObjects(viewFields[k]));
  const flatKeys = mandatoryKeys.filter((k) => !isArrayOfObjects(viewFields[k]));

  const receiptId = multiMode ? viewFields.receipt_id : null;

  return (
    <div className="flex flex-col">
      {multiMode && (
        <div
          className="flex items-center justify-between gap-3 px-8 py-4 border-b"
          style={{ borderColor: "var(--panel-border)", background: "var(--panel-bg)" }}
        >
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: "var(--input-bg)",
              color: "var(--foreground)",
              border: "1px solid var(--panel-border)",
            }}
          >
            <ChevronLeft size={16} />
            Previous
          </button>

          <div className="flex flex-col items-center gap-0.5">
            <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
              Receipt {safePage + 1} of {totalPages}
            </span>
            {receiptId && (
              <span
                className="text-[11px] font-mono"
                style={{ color: "var(--text-muted)" }}
                title={receiptId}
              >
                {receiptId}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={safePage >= totalPages - 1}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: "var(--input-bg)",
              color: "var(--foreground)",
              border: "1px solid var(--panel-border)",
            }}
          >
            Next
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {multiMode && totalPages > 1 && (
        <div
          className="flex flex-wrap items-center gap-1.5 px-8 py-3 border-b"
          style={{ borderColor: "var(--panel-border)" }}
        >
          {Array.from({ length: totalPages }).map((_, i) => {
            const isActive = i === safePage;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setCurrentPage(i)}
                className="min-w-8 h-8 px-2 rounded-md text-[12px] font-semibold transition-colors"
                style={{
                  background: isActive ? "var(--accent)" : "var(--input-bg)",
                  color: isActive ? "#fff" : "var(--text-muted)",
                  border: "1px solid var(--panel-border)",
                }}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      )}

      {mandatoryKeys.length === 0 ? (
        <div className="px-5 py-6 text-center">
          <p className="text-sm text-[var(--text-muted)] italic">
            No mandatory fields available for this {multiMode ? "receipt" : "document"}.
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
                            <FieldDisplay
                              fieldKey={key}
                              value={viewFields[key]}
                              isMandatory={isMandatoryFieldKey(key, docType)}
                            />
                            {partnerKey && (
                              <FieldDisplay
                                fieldKey={partnerKey}
                                value={viewFields[partnerKey]}
                                isMandatory={isMandatoryFieldKey(partnerKey, docType)}
                              />
                            )}
                          </div>
                        );
                      }
                      return (
                        <FieldDisplay
                          key={key}
                          fieldKey={key}
                          value={viewFields[key]}
                          isMandatory={isMandatoryFieldKey(key, docType)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Array-of-objects tables */}
          {tableKeys.length > 0 && (
            <div
              className={flatKeys.length > 0 ? "border-t" : ""}
              style={{ borderColor: "var(--panel-border)" }}
            >
              <div className="flex flex-col gap-8 px-8 py-6">
                {tableKeys.map((key) => (
                  <ArrayTable
                    key={key}
                    fieldKey={key}
                    items={viewFields[key]}
                    isMandatory={isMandatoryFieldKey(key, docType)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default memo(EditableFields);
