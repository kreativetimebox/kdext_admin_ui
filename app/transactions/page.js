"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import toast from "react-hot-toast";
import {
  Search,
  AlertCircle,
  Receipt,
  ChevronDown,
  ChevronRight,
  Filter,
  X,
} from "lucide-react";
import { useThemeStore } from "@/lib/store";
import Navbar from "@/components/Navbar/Navbar";

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function StatusBadge({ status }) {
  const colors = {
    COMPLETED: { bg: "var(--tag-green-bg)", color: "var(--tag-green-color)" },
    FAILED: { bg: "#fee2e2", color: "#b91c1c" },
    PENDING: { bg: "var(--tag-amber-bg)", color: "var(--tag-amber-color)" },
    PROCESSING: { bg: "var(--tag-bg)", color: "var(--accent)" },
  };
  const c = colors[status] || { bg: "var(--input-bg)", color: "var(--text-muted)" };
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: "0.05em",
        padding: "3px 8px",
        borderRadius: 99,
        background: c.bg,
        color: c.color,
        whiteSpace: "nowrap",
      }}
    >
      {status || "UNKNOWN"}
    </span>
  );
}

function FilterDropdown({ label, value, options, onChange }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setIsOpen((o) => !o)}
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
          minWidth: 180,
        }}
      >
        <Filter size={13} />
        {label}: {value || "All"}
        <ChevronDown size={12} style={{ marginLeft: "auto" }} />
      </button>

      {isOpen && (
        <>
          <div
            onClick={() => setIsOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              minWidth: 200,
              background: "var(--panel-bg)",
              border: "1px solid var(--panel-border)",
              borderRadius: 8,
              boxShadow: "var(--shadow-md)",
              zIndex: 50,
              maxHeight: 280,
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
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--input-bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              All
            </div>
            {options.map((opt) => (
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
                onMouseEnter={(e) => {
                  if (value !== opt) e.currentTarget.style.background = "var(--input-bg)";
                }}
                onMouseLeave={(e) => {
                  if (value !== opt) e.currentTarget.style.background = "transparent";
                }}
              >
                {opt}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TransactionRow({ record, onOpen }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(record.request_id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(record.request_id);
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(180px, 1.2fr) minmax(240px, 1.4fr) minmax(140px, 0.9fr) 110px 180px 36px",
        gap: 16,
        alignItems: "center",
        padding: "14px 20px",
        borderBottom: "1px solid var(--panel-border)",
        background: hovered ? "var(--input-bg)" : "transparent",
        cursor: "pointer",
        transition: "background 0.12s ease",
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--foreground)",
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={record.transaction_id}
      >
        {record.transaction_id}
      </span>

      <span
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={record.request_id}
      >
        {record.request_id}
      </span>

      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          padding: "4px 10px",
          borderRadius: 6,
          background: "var(--tag-purple-bg)",
          color: "var(--tag-purple-color)",
          textAlign: "center",
          justifySelf: "start",
          maxWidth: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {record.document_type || "—"}
      </span>

      <StatusBadge status={record.status} />

      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
        {formatDate(record.submitted_at)}
      </span>

      <ChevronRight size={16} style={{ color: hovered ? "var(--accent)" : "var(--text-muted)" }} />
    </div>
  );
}

export default function TransactionsPage() {
  const { initTheme } = useThemeStore();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState("");

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const res = await axios.get("/api/transactions");
      return res.data.records || [];
    },
    staleTime: 2 * 60 * 1000,
    onError: () => toast.error("Failed to load transactions"),
  });

  const records = data || [];

  const docTypeOptions = useMemo(() => {
    const set = new Set();
    for (const r of records) {
      if (r.document_type) set.add(r.document_type);
    }
    return Array.from(set).sort();
  }, [records]);

  const visibleRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (docType && r.document_type !== docType) return false;
      if (!q) return true;
      return (
        (r.transaction_id || "").toLowerCase().includes(q) ||
        (r.request_id || "").toLowerCase().includes(q)
      );
    });
  }, [records, search, docType]);

  const handleOpen = (requestId) => {
    router.push(`/transactions/${encodeURIComponent(requestId)}`);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--background)" }}>
      <Navbar />

      <main style={{ flex: 1, padding: "32px 40px", maxWidth: 1500, margin: "0 auto", width: "100%" }}>
        {/* Page header */}
        <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "linear-gradient(135deg, #0891b2 0%, #2563eb 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Receipt size={20} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>
              Transactions
            </h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
              Processing requests from{" "}
              <span style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>financedb</span>{" "}
              with a non-empty transaction_id. Click any row to view full results.
            </p>
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "5px 12px",
              borderRadius: 99,
              background: "var(--tag-bg)",
              color: "var(--accent)",
              border: "1px solid var(--panel-border)",
            }}
          >
            {visibleRecords.length} of {records.length}
          </span>
        </div>

        {/* Filters */}
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 24,
            padding: 16,
            background: "var(--panel-bg)",
            border: "1px solid var(--panel-border)",
            borderRadius: 12,
            boxShadow: "var(--shadow-sm)",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {/* Search input */}
          <div style={{ flex: 1, position: "relative", minWidth: 260 }}>
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
              placeholder="Search by transaction_id or request_id..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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

          <FilterDropdown
            label="Document Type"
            value={docType}
            options={docTypeOptions}
            onChange={setDocType}
          />

          {(search || docType) && (
            <button
              onClick={() => {
                setSearch("");
                setDocType("");
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
              }}
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
          {/* Header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(180px, 1.2fr) minmax(240px, 1.4fr) minmax(140px, 0.9fr) 110px 180px 36px",
              gap: 16,
              padding: "12px 20px",
              background: "var(--input-bg)",
              borderBottom: "1px solid var(--panel-border)",
            }}
          >
            {["Transaction ID", "Request ID", "Document Type", "Status", "Submitted"].map((h) => (
              <span
                key={h}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--text-muted)",
                }}
              >
                {h}
              </span>
            ))}
            <span />
          </div>

          {/* Body */}
          <div>
            {isLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
                Loading transactions...
              </div>
            ) : error ? (
              <div style={{ padding: 40, textAlign: "center", color: "#ef4444" }}>
                <AlertCircle size={32} style={{ marginBottom: 12 }} />
                <p>Failed to load transactions</p>
              </div>
            ) : visibleRecords.length === 0 ? (
              <div style={{ padding: 60, textAlign: "center" }}>
                <Receipt size={40} style={{ color: "var(--text-muted)", marginBottom: 12 }} />
                <p style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)", marginBottom: 4 }}>
                  No transactions found
                </p>
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {search || docType
                    ? "Try adjusting your filters"
                    : "No records with a transaction_id are available"}
                </p>
              </div>
            ) : (
              visibleRecords.map((record) => (
                <TransactionRow key={record.request_id} record={record} onOpen={handleOpen} />
              ))
            )}
          </div>

          {/* Footer */}
          {visibleRecords.length > 0 && (
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
              Showing {visibleRecords.length} of {records.length} transaction
              {records.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
