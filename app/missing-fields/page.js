"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import toast from "react-hot-toast";
import { 
  Search, 
  Filter, 
  Eye, 
  AlertCircle, 
  FileWarning,
  ChevronDown,
  X,
  ListFilter
} from "lucide-react";
import { useThemeStore, useDocumentStore } from "@/lib/store";
import Navbar from "@/components/Navbar/Navbar";

function isMissingValue(val) {
  if (val === null || val === undefined || val === "null") return true;
  if (typeof val === "string" && val.trim() === "") return true;
  if (Array.isArray(val) && val.length === 0) return true;
  return false;
}

function getFirstValueByAliases(obj, aliases = []) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const key of aliases) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      return obj[key];
    }
  }
  return undefined;
}

function isMissingByAliases(obj, aliases = []) {
  const value = getFirstValueByAliases(obj, aliases);
  return isMissingValue(value);
}

function getValueByPath(obj, path) {
  if (!obj || typeof obj !== "object") return undefined;
  const parts = String(path).split(".");
  let current = obj;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function getFirstValueByPaths(obj, paths = []) {
  for (const path of paths) {
    const value = getValueByPath(obj, path);
    if (value !== undefined) return value;
  }
  return undefined;
}

function isMissingByPaths(obj, paths = []) {
  return isMissingValue(getFirstValueByPaths(obj, paths));
}

function getMissingFieldKeys(ocrUiResults, docType = "") {
  const missing = [];
  const normalizedDocType = String(docType || "").toLowerCase();
  const compactDocType = normalizedDocType.replace(/[^a-z]/g, "");
  const isBankStatementDoc = normalizedDocType.includes("bank statement") || compactDocType.includes("bankstatement");
  const isReceiptDoc = normalizedDocType.includes("receipt");
  const isInvoiceDoc = normalizedDocType.includes("invoice");
  const isSaleDoc = normalizedDocType.includes("sale");
  const isPurchaseDoc = normalizedDocType.includes("purchase");

  if (!ocrUiResults || typeof ocrUiResults !== "object") {
    if (isBankStatementDoc) {
      return [
        "bankName",
        "accountHolderName",
        "openingDate",
        "closingDate",
        "openingBalance",
        "closingBalance",
        "currencyCode",
        "tableItems",
      ];
    }

    if (isReceiptDoc) {
      return [
        "document_id",
        "supplier_name",
        "receipt_date",
        "currency",
        "total_amount",
        "net_amount",
        "vat_amount",
        "discount",
        "items",
      ];
    }

    return [
      "documentId",
      "date",
      "dueDate",
      "currencyCode",
      "totalAmount",
      "netAmount",
      "taxAmount",
      "discountAmount",
      "tableItems",
    ];
  }

  if (isBankStatementDoc) {
    if (isMissingByPaths(ocrUiResults, ["bankName", "bank_name"])) {
      missing.push("bankName");
    }
    if (isMissingByPaths(ocrUiResults, ["accountHolderName", "account_holder_name"])) {
      missing.push("accountHolderName");
    }
    if (isMissingByPaths(ocrUiResults, ["openingDate", "opening_date"])) {
      missing.push("openingDate");
    }
    if (isMissingByPaths(ocrUiResults, ["closingDate", "closing_date"])) {
      missing.push("closingDate");
    }
    if (isMissingByPaths(ocrUiResults, ["openingBalance", "opening_balance"])) {
      missing.push("openingBalance");
    }
    if (isMissingByPaths(ocrUiResults, ["closingBalance", "closing_balance"])) {
      missing.push("closingBalance");
    }
    if (isMissingByPaths(ocrUiResults, ["currencyCode", "currency"])) {
      missing.push("currencyCode");
    }

    const items = getFirstValueByPaths(ocrUiResults, ["tableItems", "table_items", "items"]);
    if (!Array.isArray(items) || items.length === 0) {
      missing.push("tableItems");
    } else {
      items.forEach((item, index) => {
        if (!item || typeof item !== "object") {
          missing.push(`tableItems[${index}]`);
          return;
        }

        if (isMissingByPaths(item, ["description", "Payment type and details", "payment_type_and_details", "details"])) {
          missing.push(`tableItems[${index}].description`);
        }
        if (isMissingByPaths(item, ["date", "Date"])) {
          missing.push(`tableItems[${index}].date`);
        }
        if (isMissingByPaths(item, ["debitAmount", "debit_amount", "Paid out", "paid_out"])) {
          missing.push(`tableItems[${index}].debitAmount`);
        }
        if (isMissingByPaths(item, ["creditAmount", "credit_amount", "Paid in", "paid_in"])) {
          missing.push(`tableItems[${index}].creditAmount`);
        }
        if (isMissingByPaths(item, ["balanceAmount", "balance_amount", "Balance", "balance"])) {
          missing.push(`tableItems[${index}].balanceAmount`);
        }
      });
    }

    return missing;
  }

  if (isReceiptDoc) {
    if (isMissingByAliases(ocrUiResults, ["document_id", "documentId"])) {
      missing.push("document_id");
    }
    if (isMissingByAliases(ocrUiResults, ["supplier_name", "supplierName"])) {
      missing.push("supplier_name");
    }
    if (isMissingByAliases(ocrUiResults, ["receipt_date", "date"])) {
      missing.push("receipt_date");
    }
    if (isMissingByAliases(ocrUiResults, ["currency", "currencyCode"])) {
      missing.push("currency");
    }
    if (isMissingByAliases(ocrUiResults, ["total_amount", "totalAmount"])) {
      missing.push("total_amount");
    }
    if (isMissingByAliases(ocrUiResults, ["net_amount", "netAmount"])) {
      missing.push("net_amount");
    }
    if (isMissingByAliases(ocrUiResults, ["vat_amount", "taxAmount"])) {
      missing.push("vat_amount");
    }
    if (isMissingByAliases(ocrUiResults, ["discount", "discountAmount"])) {
      missing.push("discount");
    }

    const items = getFirstValueByAliases(ocrUiResults, ["items", "tableItems"]);
    if (!Array.isArray(items) || items.length === 0) {
      missing.push("items");
    } else {
      items.forEach((item, index) => {
        if (!item || typeof item !== "object") {
          missing.push(`items[${index}]`);
          return;
        }

        if (isMissingByAliases(item, ["item_name", "description"])) {
          missing.push(`items[${index}].item_name`);
        }
        if (isMissingByAliases(item, ["quantity"])) {
          missing.push(`items[${index}].quantity`);
        }
        if (isMissingByAliases(item, ["price", "unitPrice"])) {
          missing.push(`items[${index}].price`);
        }
      });
    }

    return missing;
  }

  if (isInvoiceDoc) {
    if (isMissingByPaths(ocrUiResults, ["documentId", "document_id", "invoice_number"])) {
      missing.push("documentId");
    }

    if ((isPurchaseDoc || !isSaleDoc) && isMissingByPaths(ocrUiResults, ["supplierName", "supplier_name"])) {
      missing.push("supplierName");
    }

    if (isMissingByPaths(ocrUiResults, ["customerName", "customer_name"])) {
      missing.push("customerName");
    }

    if (isMissingByPaths(ocrUiResults, ["date", "invoice_date"])) {
      missing.push("date");
    }
    if (isMissingByPaths(ocrUiResults, ["dueDate", "due_date"])) {
      missing.push("dueDate");
    }
    if (isMissingByPaths(ocrUiResults, ["currencyCode", "currency"])) {
      missing.push("currencyCode");
    }
    if (isMissingByPaths(ocrUiResults, ["totalAmount", "total_amount", "amounts.Grand Total", "amounts.total", "amounts.grand_total"])) {
      missing.push("totalAmount");
    }
    if (isMissingByPaths(ocrUiResults, ["netAmount", "net_amount", "subtotal", "amounts.Subtotal", "amounts.subtotal"])) {
      missing.push("netAmount");
    }
    if (isMissingByPaths(ocrUiResults, ["taxAmount", "vat_amount", "amounts.VAT", "amounts.vat"])) {
      missing.push("taxAmount");
    }
    if (isMissingByPaths(ocrUiResults, ["discountAmount", "discount"])) {
      missing.push("discountAmount");
    }

    const items = getFirstValueByPaths(ocrUiResults, ["tableItems", "items"]);
    if (!Array.isArray(items) || items.length === 0) {
      missing.push("tableItems");
    } else {
      items.forEach((item, index) => {
        if (!item || typeof item !== "object") {
          missing.push(`tableItems[${index}]`);
          return;
        }

        if (isMissingByPaths(item, ["description", "item_name", "Product", "product"])) {
          missing.push(`tableItems[${index}].description`);
        }
        if (isMissingByPaths(item, ["quantity", "Qty", "qty"])) {
          missing.push(`tableItems[${index}].quantity`);
        }
        if (isMissingByPaths(item, ["unitPrice", "price", "Price"])) {
          missing.push(`tableItems[${index}].unitPrice`);
        }
        if (isMissingByPaths(item, ["totalAmount", "total_amount", "Subtotal", "subtotal"])) {
          missing.push(`tableItems[${index}].totalAmount`);
        }
        if (isMissingByPaths(item, ["netAmount", "net_amount", "Subtotal", "subtotal"])) {
          missing.push(`tableItems[${index}].netAmount`);
        }
        if (isMissingByPaths(item, ["taxAmount", "tax_amount", "vat_amount", "VAT", "vat"])) {
          missing.push(`tableItems[${index}].taxAmount`);
        }
        if (isMissingByPaths(item, ["discountAmount", "discount"])) {
          missing.push(`tableItems[${index}].discountAmount`);
        }
      });
    }

    return missing;
  }

  const topLevelMandatory = [
    "documentId",
    "date",
    "dueDate",
    "currencyCode",
    "totalAmount",
    "netAmount",
    "taxAmount",
    "discountAmount",
  ];

  for (const field of topLevelMandatory) {
    if (isMissingByAliases(ocrUiResults, [field])) {
      missing.push(field);
    }
  }

  if (isSaleDoc && isMissingByAliases(ocrUiResults, ["customerName", "customer_name"])) {
    missing.push("customerName");
  }
  if (isPurchaseDoc && isMissingByAliases(ocrUiResults, ["supplierName", "supplier_name"])) {
    missing.push("supplierName");
  }

  const tableItems = getFirstValueByAliases(ocrUiResults, ["tableItems", "items"]);
  const itemMandatory = [
    "description",
    "quantity",
    "unitPrice",
    "totalAmount",
    "netAmount",
    "taxAmount",
    "discountAmount",
  ];

  if (!Array.isArray(tableItems) || tableItems.length === 0) {
    missing.push("tableItems");
  } else {
    tableItems.forEach((item, index) => {
      if (!item || typeof item !== "object") {
        missing.push(`tableItems[${index}]`);
        return;
      }

      for (const field of itemMandatory) {
        if (field === "description") {
          if (isMissingByAliases(item, ["description", "item_name"])) {
            missing.push(`tableItems[${index}].${field}`);
          }
          continue;
        }

        if (field === "unitPrice") {
          if (isMissingByAliases(item, ["unitPrice", "price"])) {
            missing.push(`tableItems[${index}].${field}`);
          }
          continue;
        }

        if (isMissingByAliases(item, [field])) {
          missing.push(`tableItems[${index}].${field}`);
        }
      }
    });
  }

  return missing;
}

/* ── Filter dropdown ──────────────────────────────────────── */
function FilterDropdown({ label, value, options, onChange, onClear }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          border: "1px solid var(--panel-border)",
          background: value ? "var(--tag-bg)" : "var(--input-bg)",
          color: value ? "var(--accent)" : "var(--foreground)",
          cursor: "pointer",
          transition: "all 0.15s",
        }}
      >
        <Filter size={13} />
        {label}: {value || "All"}
        <ChevronDown size={12} style={{ marginLeft: "auto" }} />
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            minWidth: 180,
            background: "var(--panel-bg)",
            border: "1px solid var(--panel-border)",
            borderRadius: 8,
            boxShadow: "var(--shadow-md)",
            zIndex: 50,
            maxHeight: 240,
            overflowY: "auto",
          }}
        >
          <div
            onClick={() => {
              onChange("");
              setIsOpen(false);
            }}
            style={{
              padding: "8px 12px",
              fontSize: 13,
              cursor: "pointer",
              color: "var(--text-muted)",
              borderBottom: "1px solid var(--panel-border)",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--input-bg)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            All
          </div>
          {options.map(opt => (
            <div
              key={opt}
              onClick={() => {
                onChange(opt);
                setIsOpen(false);
              }}
              style={{
                padding: "8px 12px",
                fontSize: 13,
                cursor: "pointer",
                color: "var(--foreground)",
                background: value === opt ? "var(--tag-bg)" : "transparent",
              }}
              onMouseEnter={e => {
                if (value !== opt) e.currentTarget.style.background = "var(--input-bg)";
              }}
              onMouseLeave={e => {
                if (value !== opt) e.currentTarget.style.background = "transparent";
              }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Missing fields row ───────────────────────────────────── */
function MissingFieldRow({ doc, onView }) {
  const [hovered, setHovered] = useState(false);

  // Count missing mandatory fields in ocr_ui_results
  const nullFields = getMissingFieldKeys(doc.ocr_ui_results, doc.ocr_document_type);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "100px 180px 120px 1fr 100px",
        gap: 16,
        alignItems: "center",
        padding: "14px 20px",
        borderBottom: "1px solid var(--panel-border)",
        background: hovered ? "var(--input-bg)" : "transparent",
        transition: "background 0.15s",
      }}
    >
      {/* ID */}
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>
        #{doc.id}
      </span>

      {/* Document Type */}
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          padding: "4px 10px",
          borderRadius: 6,
          background: "var(--tag-purple-bg)",
          color: "var(--tag-purple-color)",
          textAlign: "center",
        }}
      >
        {doc.ocr_document_type || "Unknown"}
      </span>

      {/* Environment */}
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          padding: "4px 10px",
          borderRadius: 6,
          background: "var(--tag-amber-bg)",
          color: "var(--tag-amber-color)",
          textAlign: "center",
        }}
      >
        {doc.environment || "N/A"}
      </span>

      {/* Missing Fields */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <FileWarning size={14} style={{ color: "var(--text-muted)" }} />
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {nullFields.length} field{nullFields.length !== 1 ? "s" : ""} missing:
        </span>
        <span style={{ fontSize: 12, color: "var(--foreground)", fontWeight: 500 }}>
          {nullFields.slice(0, 3).join(", ")}
          {nullFields.length > 3 && ` +${nullFields.length - 3} more`}
        </span>
      </div>

      {/* View Button */}
      <button
        onClick={() => onView(doc.id)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: "7px 14px",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          background: "linear-gradient(135deg, #2563eb 0%, #6366f1 100%)",
          color: "#fff",
          border: "none",
          cursor: "pointer",
          boxShadow: hovered ? "0 4px 12px rgba(37,99,235,0.4)" : "none",
          transform: hovered ? "translateY(-1px)" : "translateY(0)",
          transition: "all 0.2s",
        }}
      >
        <Eye size={13} />
        View
      </button>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────── */
export default function MissingFieldsPage() {
  const { initTheme } = useThemeStore();
  const { setActiveId } = useDocumentStore();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState("");
  const [environment, setEnvironment] = useState("");
  const [showAll, setShowAll] = useState(true);

  useEffect(() => { initTheme(); }, [initTheme]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["missing-fields", search, docType, environment, showAll],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      if (docType) params.append("docType", docType);
      if (environment) params.append("environment", environment);
      params.append("showAll", showAll.toString());
      
      const res = await axios.get(`/api/missing-fields?${params.toString()}`);
      return res.data.documents || [];
    },
    staleTime: 2 * 60 * 1000,
    onError: () => toast.error("Failed to load documents with missing fields"),
  });

  const handleView = (docId) => {
    setActiveId(docId);
    router.push(`/analyzer?focusId=${docId}`);
  };

  // Extract unique doc types and environments for filters
  const docTypes = data ? [...new Set(data.map(d => d.ocr_document_type).filter(Boolean))] : [];
  const environments = data ? [...new Set(data.map(d => d.environment).filter(Boolean))] : [];
  const visibleDocuments = showAll
    ? (data || [])
    : (data || []).filter((doc) => getMissingFieldKeys(doc?.ocr_ui_results, doc?.ocr_document_type).length > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--background)" }}>
      <Navbar />

      <main style={{ flex: 1, padding: "32px 40px", maxWidth: 1400, margin: "0 auto", width: "100%" }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: showAll 
                  ? "linear-gradient(135deg, #2563eb 0%, #6366f1 100%)"
                  : "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {showAll ? <ListFilter size={20} color="#fff" /> : <AlertCircle size={20} color="#fff" />}
            </div>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>
                {showAll ? "All Documents" : "Missing Mandatory Fields"}
              </h1>
              <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>
                {showAll 
                  ? "Complete list of all processed documents"
                  : "Documents with incomplete or null values in OCR results"}
              </p>
            </div>
            
            {/* Toggle */}
            <button
              onClick={() => setShowAll(!showAll)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 18px",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                border: "1px solid var(--panel-border)",
                background: showAll ? "var(--input-bg)" : "var(--tag-bg)",
                color: showAll ? "var(--foreground)" : "var(--accent)",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {showAll ? <AlertCircle size={14} /> : <ListFilter size={14} />}
              {showAll ? "Show Only Missing Fields" : "Show All Documents"}
            </button>
          </div>
        </div>

        {/* Search & Filters */}
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 24,
            padding: 20,
            background: "var(--panel-bg)",
            border: "1px solid var(--panel-border)",
            borderRadius: 12,
            boxShadow: "var(--shadow-sm)",
          }}
        >
          {/* Search */}
          <div style={{ flex: 1, position: "relative" }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
            />
            <input
              type="text"
              placeholder="Search by ID, document type, or environment..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 12px 9px 38px",
                fontSize: 13,
                border: "1px solid var(--input-border)",
                borderRadius: 8,
                background: "var(--input-bg)",
                color: "var(--foreground)",
                outline: "none",
              }}
            />
          </div>

          {/* Filters */}
          <FilterDropdown
            label="Type"
            value={docType}
            options={docTypes}
            onChange={setDocType}
          />
          <FilterDropdown
            label="Environment"
            value={environment}
            options={environments}
            onChange={setEnvironment}
          />

          {/* Clear all */}
          {(search || docType || environment) && (
            <button
              onClick={() => {
                setSearch("");
                setDocType("");
                setEnvironment("");
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                border: "1px solid var(--panel-border)",
                background: "var(--input-bg)",
                color: "var(--text-muted)",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--panel-border)"}
              onMouseLeave={e => e.currentTarget.style.background = "var(--input-bg)"}
            >
              <X size={13} />
              Clear
            </button>
          )}
        </div>

        {/* Table */}
        <div
          style={{
            background: "var(--panel-bg)",
            border: "1px solid var(--panel-border)",
            borderRadius: 12,
            boxShadow: "var(--shadow-sm)",
            overflow: "hidden",
          }}
        >
          {/* Table Header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "100px 180px 120px 1fr 100px",
              gap: 16,
              padding: "12px 20px",
              background: "var(--input-bg)",
              borderBottom: "1px solid var(--panel-border)",
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              ID
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              Document Type
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              Environment
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              Missing Fields
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", textAlign: "center" }}>
              Action
            </span>
          </div>

          {/* Table Body */}
          <div style={{ maxHeight: "calc(100vh - 400px)", overflowY: "auto" }}>
            {isLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
                Loading documents...
              </div>
            ) : error ? (
              <div style={{ padding: 40, textAlign: "center", color: "#ef4444" }}>
                <AlertCircle size={32} style={{ marginBottom: 12 }} />
                <p>Failed to load documents</p>
              </div>
            ) : visibleDocuments.length === 0 ? (
              <div style={{ padding: 60, textAlign: "center" }}>
                <FileWarning size={40} style={{ color: "var(--text-muted)", marginBottom: 12 }} />
                <p style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)", marginBottom: 4 }}>
                  No documents found
                </p>
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {search || docType || environment
                    ? "Try adjusting your filters"
                    : showAll 
                      ? "No documents available" 
                      : "All documents have complete data!"}
                </p>
              </div>
            ) : (
              visibleDocuments.map(doc => (
                <MissingFieldRow key={doc.id} doc={doc} onView={handleView} />
              ))
            )}
          </div>

          {/* Footer */}
          {visibleDocuments.length > 0 && (
            <div
              style={{
                padding: "12px 20px",
                background: "var(--input-bg)",
                borderTop: "1px solid var(--panel-border)",
                fontSize: 12,
                color: "var(--text-muted)",
                textAlign: "center",
              }}
            >
              Showing {visibleDocuments.length} document{visibleDocuments.length !== 1 ? "s" : ""} 
              {!showAll && " with missing fields"}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
