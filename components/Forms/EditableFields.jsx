"use client";

import { useState, useEffect, memo, useCallback } from "react";
import { Save, Loader2, RotateCcw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import axios from "axios";

/* ── Items & VAT keys (get taller textarea) ── */
const LARGE_TEXTAREA_KEYS = ["items", "vat_information", "vat_info", "line_items", "products"];

function isLargeTextareaField(key) {
  const k = key.toLowerCase();
  return LARGE_TEXTAREA_KEYS.some((lk) => k.includes(lk));
}

/* ── Field section grouping ── */
const FIELD_GROUPS = [
  { label: "Supplier Info", keys: ["supplier", "vendor", "customer", "vat_number", "website", "email", "phone"] },
  { label: "Transaction",   keys: ["receipt_number", "invoice_number", "order_number", "invoice_id", "date", "due_date", "payment", "card", "currency"] },
  { label: "Amounts",       keys: ["subtotal", "total_amount", "total", "net", "tax", "gross", "discount", "amount"] },
  { label: "Items & VAT",   keys: ["items", "vat_information", "vat_info", "vat_amount", "vat_rate", "vat_code", "line_items", "products"] },
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

  // JSON objects / arrays
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try { return JSON.parse(trimmed); } catch { /* keep as string */ }
  }

  // Null — restore null if original was null/undefined
  if (trimmed === "" && (originalVal === null || originalVal === undefined)) return null;
  if (trimmed.toLowerCase() === "null") return null;

  // Number — only coerce back if the original was a number
  if (typeof originalVal === "number" && trimmed !== "") {
    const num = Number(trimmed);
    if (!isNaN(num) && isFinite(num)) return num;
  }

  // Boolean — only coerce back if the original was a boolean
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
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
      "documentid",
      "document_id",
      "bankname",
      "bank_name",
      "accountholdername",
      "account_holder_name",
      "openingdate",
      "opening_date",
      "closingdate",
      "closing_date",
      "openingbalance",
      "opening_balance",
      "closingbalance",
      "closing_balance",
      "currencycode",
      "currency",
      "tableitems",
      "table_items",
      "items",
    ]);
  }

  if (type.isReceipt) {
    return new Set([
      "document_id",
      "documentid",
      "supplier_name",
      "suppliername",
      "receipt_date",
      "date",
      "currency",
      "currencycode",
      "total_amount",
      "totalamount",
      "net_amount",
      "netamount",
      "vat_amount",
      "taxamount",
      "discount",
      "discountamount",
      "items",
      "tableitems",
    ]);
  }

  if (type.isInvoice) {
    const keys = new Set([
      "documentid",
      "document_id",
      "invoice_number",
      "date",
      "invoice_date",
      "duedate",
      "due_date",
      "currencycode",
      "currency",
      "totalamount",
      "total_amount",
      "amounts",
      "grandtotal",
      "grand_total",
      "netamount",
      "net_amount",
      "subtotal",
      "taxamount",
      "vat_amount",
      "vat",
      "discountamount",
      "discount",
      "tableitems",
      "items",
    ]);
    keys.add("customername");
    keys.add("customer_name");
    if (!type.isSale) {
      keys.add("suppliername");
      keys.add("supplier_name");
    }
    return keys;
  }

  const keys = new Set([
    "documentid",
    "date",
    "duedate",
    "currencycode",
    "totalamount",
    "netamount",
    "taxamount",
    "discountamount",
    "tableitems",
    "items",
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

/* ── Single field ── */
function FieldInput({ fieldKey, value, onChange, isMandatory = false }) {
  const isObj = typeof value === "object" && value !== null;
  const isLong = !isObj && String(value ?? "").length > 100;
  const useLargeTa = isLargeTextareaField(fieldKey);

  if (isObj || isLong || useLargeTa) {
    return (
      <div className="flex flex-col gap-2.5">
        <label className="text-[13px] font-semibold uppercase tracking-wider pl-1" style={{ color: "var(--text-muted)" }}>
          {toLabel(fieldKey)}
          {isMandatory && <span style={{ color: "#ef4444", marginLeft: 4 }}>*</span>}
        </label>
        <textarea
          value={isObj ? JSON.stringify(value, null, 2) : String(value ?? "")}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          rows={useLargeTa ? 14 : 4}
          className="w-full px-5 py-4 text-[14px] rounded-lg border transition-all resize-y font-mono overflow-y-auto"
          style={{
            background: "var(--input-bg)",
            borderColor: "var(--input-border)",
            color: "var(--foreground)",
            minHeight: useLargeTa ? "20rem" : "5rem",
            maxHeight: useLargeTa ? "40rem" : "10rem",
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
        value={String(value ?? "")}
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
    if (document?.ocr_ui_results && typeof document.ocr_ui_results === "object") {
      setFields(document.ocr_ui_results);
    } else if (document?.ocr_results && typeof document.ocr_results === "object") {
      const keys = Object.keys(document.ocr_results);
      if (keys.length > 0) setFields(document.ocr_results);
      else setFields({});
    } else {
      setFields({});
    }
  }, [document]);

  const handleChange = useCallback((key, value) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = async () => {
    if (!document?.id) return;
    setIsSaving(true);
    try {
      const original = document?.ocr_ui_results ?? document?.ocr_results ?? {};

      // Coerce every field value back to its proper type before saving
      const parsed = {};
      for (const [key, val] of Object.entries(fields)) {
        parsed[key] = coerceToOriginalType(val, original[key]);
      }

      const { data } = await axios.post(`/api/document/${document.id}/update`, parsed);

      // Sync local state with the properly-typed data returned from the DB
      if (data?.ocr_ui_results && typeof data.ocr_ui_results === "object") {
        setFields(data.ocr_ui_results);
      } else {
        setFields(parsed);
      }

      // Invalidate the react-query cache so navigating away & back shows fresh data
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

  const keys = Object.keys(fields);
  const docType = document?.ocr_document_type || "";
  const mandatoryKeys = keys.filter((key) => isMandatoryFieldKey(key, docType));

  return (
    <div className="flex flex-col">
      {mandatoryKeys.length === 0 ? (
        <div className="px-5 py-6 text-center">
          <p className="text-sm text-[var(--text-muted)] italic">No mandatory editable fields available for this document.</p>
        </div>
      ) : (
        <>
          {/* Fields area */}
          <div>
            {groupFields(mandatoryKeys).map((group, gi) => (
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

          {/* Buttons — always visible, outside the scroll */}
          <div
            className="flex items-center justify-center gap-5 px-8 py-6 border-t"
            style={{ borderColor: "var(--panel-border)", background: "var(--panel-bg)" }}
          >
            <button
              type="button"
              className="flex items-center justify-center gap-3 rounded-xl text-lg font-medium transition-colors"
              style={{ background: "var(--input-bg)", color: "var(--text-muted)", border: "1px solid var(--panel-border)", minWidth: "160px", minHeight: "52px", padding: "14px 32px" }}
              onClick={() => { if (document?.ocr_ui_results) setFields(document.ocr_ui_results); }}
            >
              <RotateCcw size={18} />
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !document?.id}
              className="flex items-center justify-center gap-3 rounded-xl text-lg font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: isSaving ? "var(--text-muted)" : "var(--accent)", minWidth: "180px", minHeight: "52px", padding: "14px 36px" }}
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
