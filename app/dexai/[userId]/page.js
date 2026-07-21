"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import axios from "axios";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Search,
  AlertCircle,
  Receipt,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  Mail,
  Eye,
  Clock,
  Calendar,
  FileText,
  Pencil,
  Download,
} from "lucide-react";
import { useThemeStore, useDocumentStore } from "@/lib/store";
import { ISSUE_TYPES, BUG_STATUSES } from "@/lib/constants";
import Navbar from "@/components/Navbar/Navbar";
import ValidationDot from "@/components/Results/ValidationDot";

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function formatDuration(ms) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const rem = (s % 60).toFixed(0);
  return `${m}m ${rem}s`;
}

function fullName(u) {
  const parts = [u?.first_name, u?.last_name].filter(Boolean);
  return parts.length ? parts.join(" ") : "—";
}

function KeyEnvBadge({ env }) {
  if (!env) return <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>;
  const colors = {
    production: { bg: "var(--tag-green-bg)", color: "var(--tag-green-color)" },
    sandbox: { bg: "var(--tag-amber-bg)", color: "var(--tag-amber-color)" },
    test: { bg: "var(--tag-purple-bg)", color: "var(--tag-purple-color)" },
    testing: { bg: "var(--tag-purple-bg)", color: "var(--tag-purple-color)" },
  };
  const c = colors[String(env).toLowerCase()] || { bg: "var(--tag-bg)", color: "var(--tag-color)" };
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 8px",
        borderRadius: 6,
        background: c.bg,
        color: c.color,
        textTransform: "capitalize",
        justifySelf: "start",
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {env}
    </span>
  );
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

const BUG_STATUS_COLORS = {
  Open: { bg: "rgba(239,68,68,0.12)", color: "#ef4444" },
  TO_BE_TESTED: { bg: "rgba(249,115,22,0.12)", color: "#f97316" },
  Closed: { bg: "rgba(34,197,94,0.12)", color: "#22c55e" },
};

function BugStatusCell({ resultId, bugStatus, onChanged }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const c = BUG_STATUS_COLORS[bugStatus] || { bg: "var(--input-bg)", color: "var(--text-muted)" };

  async function choose(val) {
    setOpen(false);
    if (val === bugStatus || !resultId) return;
    setSaving(true);
    try {
      const res = await axios.post(`/api/document/${encodeURIComponent(resultId)}/update-bug-tracking`, { bugStatus: val });
      if (res.data?.ok === false) {
        toast.error(res.data.error || "Failed to update bug status");
        return;
      }
      onChanged(resultId, val);
      toast.success("Bug status updated");
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to update bug status");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={saving || !resultId}
        style={{
          display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 99,
          fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", background: c.bg, color: c.color,
          border: "none", cursor: saving ? "wait" : "pointer", whiteSpace: "nowrap", opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? "…" : (bugStatus || "—")}
        <ChevronDown size={9} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.12s" }} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div
            style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50, minWidth: 150,
              background: "var(--menu-bg)", border: "1px solid var(--panel-border)", borderRadius: 8,
              boxShadow: "var(--shadow-md)", padding: 4,
            }}
          >
            {BUG_STATUSES.map((val) => (
              <div
                key={val}
                onClick={() => choose(val)}
                style={{
                  padding: "8px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer",
                  color: "var(--foreground)", background: val === bugStatus ? "var(--input-bg)" : "transparent",
                }}
              >
                {val}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FilterDropdown({ label, value, options, onChange, icon: Icon = Filter }) {
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
        <Icon size={13} />
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
              background: "var(--menu-bg)",
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

function ResultRow({ record, onView, onEdit, onBugStatusChanged }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "grid",
        gridTemplateColumns:
          "minmax(170px, 1.2fr) minmax(130px, 0.9fr) minmax(120px, 0.8fr) 120px 100px 140px 130px 160px 150px 150px 100px 160px",
        gap: 16,
        alignItems: "center",
        padding: "14px 20px",
        borderBottom: "1px solid var(--panel-border)",
        background: hovered ? "var(--input-bg)" : "transparent",
        transition: "background 0.12s ease",
      }}
    >
      <span
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          color: "var(--accent)",
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
          color: "var(--foreground)",
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={record.result_id ? String(record.result_id) : ""}
      >
        {record.result_id ?? "—"}
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

      <KeyEnvBadge env={record.key_environment} />

      <StatusBadge status={record.status} />

      <ValidationDot validation={record.validation} />

      <BugStatusCell
        resultId={record.result_id}
        bugStatus={record.bug_status}
        onChanged={onBugStatusChanged}
      />

      <span
        style={{
          fontSize: 12,
          color: "var(--foreground)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={record.issue_type || ""}
      >
        {record.issue_type || "—"}
      </span>

      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
        {formatDate(record.created_at || record.submitted_at)}
      </span>

      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
        {formatDate(record.updated_at || record.completed_at)}
      </span>

      <span
        style={{
          fontSize: 12,
          color: "var(--foreground)",
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <Clock size={11} style={{ color: "var(--text-muted)" }} />
        {formatDuration(record.processing_duration_ms)}
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
        {record.validation === false && record.result_id != null && (
          <button
            onClick={() => onEdit(record.result_id)}
            title="Open result in HITL Edit"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              border: "1px solid #c2410c",
              background: "#ea580c",
              color: "#fff",
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(124,45,18,0.35)",
              transition: "all 0.15s ease",
            }}
          >
            <Pencil size={12} />
            Edit
          </button>
        )}

        <button
          onClick={() => onView(record.request_id)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            border: "none",
            background:
              "var(--brand-gradient)",
            color: "#fff",
            cursor: "pointer",
            boxShadow: hovered ? "0 4px 14px rgba(20,14,53,0.26)" : "0 2px 6px rgba(20,14,53,0.18)",
            transition: "all 0.15s ease",
          }}
        >
          <Eye size={12} />
          View
        </button>
      </div>
    </div>
  );
}

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 350;
const STATUS_OPTIONS = ["COMPLETED", "PENDING", "PROCESSING", "TO_BE_TESTED", "FAILED"];

export default function UserResultsPage({ params }) {
  const { userId } = use(params);
  const { initTheme } = useThemeStore();
  const { setActiveId } = useDocumentStore();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [docType, setDocType] = useState("");
  const [status, setStatus] = useState("");
  const [keyEnv, setKeyEnv] = useState("");
  const [bugStatus, setBugStatus] = useState("");
  const [issueType, setIssueType] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  // Keep the input feeling instant while the network request trails behind.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, docType, status, keyEnv, bugStatus, issueType]);

  const userQuery = useQuery({
    queryKey: ["dexai", "user", userId],
    queryFn: async () => {
      const res = await axios.get(`/api/dexai/users/${encodeURIComponent(userId)}`);
      return res.data;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  const resultsQuery = useQuery({
    queryKey: ["dexai", "user-results", userId, { debouncedSearch, docType, status, keyEnv, bugStatus, issueType, page }],
    queryFn: async () => {
      const res = await axios.get(
        `/api/dexai/users/${encodeURIComponent(userId)}/results`,
        { params: { search: debouncedSearch, docType, status, keyEnvironment: keyEnv, bugStatus, issueType, page, pageSize: PAGE_SIZE } }
      );
      return res.data;
    },
    enabled: !!userId,
    placeholderData: keepPreviousData,
    staleTime: 2 * 60 * 1000,
    onError: () => toast.error("Failed to load results"),
  });

  const { data: filterOptions } = useQuery({
    queryKey: ["filter-options"],
    queryFn: async () => {
      const res = await axios.get("/api/filter-options");
      return res.data;
    },
    staleTime: 10 * 60 * 1000,
  });

  const user = userQuery.data;
  const records = resultsQuery.data?.records || [];
  const total = resultsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // docType/status/keyEnv/search are all applied server-side now (see the
  // useQuery above), so `records` is already exactly what should render.
  const docTypeOptions = filterOptions?.docTypes || [];
  const keyEnvOptions = filterOptions?.keyEnvironments || [];

  const handleView = (requestId) => {
    router.push(`/dexai/result/${encodeURIComponent(requestId)}`);
  };

  const handleBugStatusChanged = () => {
    queryClient.invalidateQueries({ queryKey: ["dexai", "user-results", userId] });
  };

  const exportUrl = `/api/dexai/users/${encodeURIComponent(userId)}/results/export?${new URLSearchParams({
    search: debouncedSearch,
    docType,
    status,
    keyEnvironment: keyEnv,
    bugStatus,
    issueType,
  }).toString()}`;

  // "To be tested" rows → open the result directly in the HITL edit view.
  // The view route resolves a document by its result_id.
  const handleEdit = (resultId) => {
    if (!resultId) return;
    setActiveId(resultId);
    router.push(`/view/${encodeURIComponent(resultId)}`);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "var(--background)",
      }}
    >
      <Navbar />

      <main
        style={{
          flex: 1,
          padding: "32px 40px",
          width: "100%",
        }}
      >
        {/* Back link */}
        <button
          onClick={() => router.push("/dexai")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 500,
            border: "1px solid var(--panel-border)",
            background: "var(--input-bg)",
            color: "var(--text-muted)",
            cursor: "pointer",
            marginBottom: 16,
          }}
        >
          <ArrowLeft size={13} />
          Back to users
        </button>

        {/* User header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "18px 20px",
            marginBottom: 20,
            background: "var(--panel-bg)",
            border: "1px solid var(--panel-border)",
            borderRadius: 12,
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: "var(--brand-gradient)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {((user?.first_name?.[0] || "") + (user?.last_name?.[0] || "")).toUpperCase() ||
              (user?.email?.[0] || "?").toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "var(--foreground)",
                margin: 0,
              }}
            >
              {userQuery.isLoading ? "Loading…" : fullName(user)}
            </h1>
            <div
              style={{
                display: "flex",
                gap: 16,
                marginTop: 6,
                color: "var(--text-muted)",
                fontSize: 12,
                flexWrap: "wrap",
              }}
            >
              {user?.email && (
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <Mail size={12} />
                  {user.email}
                </span>
              )}
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <Calendar size={12} />
                Joined {formatDate(user?.created_at)}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <FileText size={12} />
                {total} results
              </span>
            </div>
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "4px 10px",
              borderRadius: 99,
              background: user?.is_active ? "var(--tag-green-bg)" : "var(--input-bg)",
              color: user?.is_active ? "var(--tag-green-color)" : "var(--text-muted)",
              border: "1px solid var(--panel-border)",
            }}
          >
            {user?.is_active ? "ACTIVE" : "INACTIVE"}
          </span>
        </div>

        {/* Filters */}
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 20,
            padding: 16,
            background: "var(--panel-bg)",
            border: "1px solid var(--panel-border)",
            borderRadius: 12,
            boxShadow: "var(--shadow-sm)",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
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
              placeholder="Search by request_id, result_id, transaction_id, filename, type, date..."
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
            label="Type"
            value={docType}
            options={docTypeOptions}
            onChange={setDocType}
          />

          <FilterDropdown
            label="Status"
            value={status}
            options={STATUS_OPTIONS}
            onChange={setStatus}
          />

          <FilterDropdown
            label="Key Environment"
            value={keyEnv}
            options={keyEnvOptions}
            onChange={setKeyEnv}
          />

          <FilterDropdown
            label="Bug Status"
            value={bugStatus}
            options={BUG_STATUSES}
            onChange={setBugStatus}
          />

          <FilterDropdown
            label="Issue Type"
            value={issueType}
            options={ISSUE_TYPES}
            onChange={setIssueType}
          />

          {(search || docType || status || keyEnv || bugStatus || issueType) && (
            <button
              onClick={() => {
                setSearch("");
                setDocType("");
                setStatus("");
                setKeyEnv("");
                setBugStatus("");
                setIssueType("");
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

          <a
            href={exportUrl}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              border: "1px solid var(--panel-border)",
              background: "var(--brand-gradient)",
              color: "#fff",
              cursor: "pointer",
              textDecoration: "none",
            }}
          >
            <Download size={13} />
            Export CSV
          </a>
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
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "minmax(170px, 1.2fr) minmax(130px, 0.9fr) minmax(130px, 0.9fr) minmax(120px, 0.8fr) 100px 140px 130px 160px 150px 150px 100px 160px",
              gap: 16,
              padding: "12px 20px",
              background: "var(--input-bg)",
              borderBottom: "1px solid var(--panel-border)",
            }}
          >
            {[
              "Request ID",
              "Result ID",
              "Document Type",
              "Key Environment",
              "Status",
              "Validation",
              "Bug Status",
              "Issue Type",
              "Created At",
              "Updated At",
              "Processing",
              "",
            ].map((h, i) => (
              <span
                key={i}
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
          </div>

          <div>
            {resultsQuery.isLoading ? (
              <div
                style={{
                  padding: 40,
                  textAlign: "center",
                  color: "var(--text-muted)",
                }}
              >
                Loading results...
              </div>
            ) : resultsQuery.error ? (
              <div style={{ padding: 40, textAlign: "center", color: "#ef4444" }}>
                <AlertCircle size={32} style={{ marginBottom: 12 }} />
                <p>Failed to load results</p>
              </div>
            ) : records.length === 0 ? (
              <div style={{ padding: 60, textAlign: "center" }}>
                <Receipt
                  size={40}
                  style={{ color: "var(--text-muted)", marginBottom: 12 }}
                />
                <p
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: "var(--foreground)",
                    marginBottom: 4,
                  }}
                >
                  No results found
                </p>
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {search || docType || status || keyEnv
                    ? "Try adjusting your filters"
                    : "This user has no document processing requests"}
                </p>
              </div>
            ) : (
              records.map((r) => (
                <ResultRow
                  key={r.request_id}
                  record={r}
                  onView={handleView}
                  onEdit={handleEdit}
                  onBugStatusChanged={handleBugStatusChanged}
                />
              ))
            )}
          </div>

          {records.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
                padding: "12px 20px",
                background: "var(--input-bg)",
                borderTop: "1px solid var(--panel-border)",
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--panel-border)",
                  background: "var(--panel-bg)",
                  color: "var(--foreground)",
                  fontSize: 12,
                  cursor: page <= 1 ? "not-allowed" : "pointer",
                  opacity: page <= 1 ? 0.4 : 1,
                }}
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span>
                Page {page} of {totalPages} · {total} result{total !== 1 ? "s" : ""}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--panel-border)",
                  background: "var(--panel-bg)",
                  color: "var(--foreground)",
                  fontSize: 12,
                  cursor: page >= totalPages ? "not-allowed" : "pointer",
                  opacity: page >= totalPages ? 0.4 : 1,
                }}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
