"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import toast from "react-hot-toast";
import {
  Search,
  Eye,
  AlertCircle,
  FileWarning,
  ChevronDown,
  X,
  ListFilter,
  Building2,
  UserCircle,
  ShieldCheck,
} from "lucide-react";
import { useThemeStore, useDocumentStore } from "@/lib/store";
import { useAuth } from "@/lib/useAuth";
import Navbar from "@/components/Navbar/Navbar";
import ValidationDot from "@/components/Results/ValidationDot";

const HITL_ASSIGN_ALLOWED = ["financeai@financeai.com", "rashika@financeai.com"];
function emailCanAssign(email = "") {
  return HITL_ASSIGN_ALLOWED.includes(email.toLowerCase());
}

/* ── Shared with Business Audit ───────────────────────────── */
function menuItemBaseStyle(active) {
  return {
    padding: "8px 10px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    background: active ? "var(--input-bg)" : "transparent",
    transition: "background 0.1s ease",
  };
}

function SearchableDropdown({
  icon: Icon,
  placeholder,
  searchPlaceholder = "Search...",
  emptyText = "No results",
  options,
  value,
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const selected = options.find((o) => o.value === value) || null;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          (o.sublabel || "").toLowerCase().includes(q)
      )
    : options;

  const choose = (val) => {
    onChange(val);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 210 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 12px",
          fontSize: 13,
          width: "100%",
          border: "1px solid var(--input-border)",
          borderRadius: 8,
          background: "var(--input-bg)",
          color: selected ? "var(--foreground)" : "var(--text-muted)",
          cursor: "pointer",
          outline: "none",
        }}
      >
        {Icon && <Icon size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />}
        <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          style={{
            color: "var(--text-muted)",
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.12s ease",
          }}
        />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 50,
            width: "max(100%, 260px)",
            background: "var(--menu-bg)",
            border: "1px solid var(--panel-border)",
            borderRadius: 8,
            boxShadow: "var(--shadow-sm)",
            padding: 4,
          }}
        >
          <div style={{ position: "relative", marginBottom: 4 }}>
            <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              style={{
                width: "100%",
                padding: "8px 10px 8px 30px",
                fontSize: 13,
                border: "1px solid var(--input-border)",
                borderRadius: 6,
                background: "var(--input-bg)",
                color: "var(--foreground)",
                outline: "none",
              }}
            />
          </div>

          <div style={{ maxHeight: 280, overflowY: "auto", overflowX: "hidden" }}>
            <div
              role="button"
              onClick={() => choose("")}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = value === "" ? "var(--input-bg)" : "transparent"; }}
              style={menuItemBaseStyle(value === "")}
            >
              {placeholder}
            </div>

            {filtered.length === 0 ? (
              <div style={{ padding: "10px", fontSize: 12, color: "var(--text-muted)" }}>{emptyText}</div>
            ) : (
              filtered.map((o) => (
                <div
                  key={o.value}
                  role="button"
                  onClick={() => choose(o.value)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = o.value === value ? "var(--input-bg)" : "transparent"; }}
                  style={{ ...menuItemBaseStyle(o.value === value), display: "flex", flexDirection: "column", gap: 2 }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {o.label}
                  </span>
                  {o.sublabel && (
                    <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "ui-monospace, SFMono-Regular, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {o.sublabel}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(value) {
  if (!value) return "—";
  try { return new Date(value).toLocaleString(); } catch { return String(value); }
}

function matchesDate(value, q) {
  if (!value) return false;
  if (String(value).toLowerCase().includes(q)) return true;
  try { return new Date(value).toLocaleString().toLowerCase().includes(q); } catch { return false; }
}

/* ── HITL assignee cell ───────────────────────────────────── */
function HitlAssignCell({ docId, currentId, hitlUsers, onAssigned, canAssign }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQuery(""); }
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  const selected = hitlUsers.find((u) => String(u.id) === String(currentId ?? "")) || null;

  // Read-only view for users who cannot assign
  if (!canAssign) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          fontSize: 12,
          fontWeight: 500,
          borderRadius: 7,
          border: "1px solid var(--input-border)",
          background: selected ? "var(--tag-bg)" : "var(--input-bg)",
          color: selected ? "var(--accent)" : "var(--text-muted)",
          whiteSpace: "nowrap",
          maxWidth: 160,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        <ShieldCheck size={12} style={{ flexShrink: 0 }} />
        {selected ? selected.label : "—"}
      </span>
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = q ? hitlUsers.filter((u) => u.label.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) : hitlUsers;
  const currentIdStr = String(currentId ?? "");

  async function assign(userId) {
    setSaving(true);
    setOpen(false);
    setQuery("");
    try {
      const res = await axios.post(`/api/document/${encodeURIComponent(docId)}/assign-hitl`, { hitlUserId: userId || null });
      if (res.data?.ok === false) {
        toast.error(res.data.error || "Failed to assign");
        return;
      }
      onAssigned(docId, userId || null);
      toast.success(userId ? "Assigned" : "Unassigned");
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to assign");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={saving}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          fontSize: 12,
          fontWeight: 500,
          borderRadius: 7,
          border: "1px solid var(--input-border)",
          background: selected ? "var(--tag-bg)" : "var(--input-bg)",
          color: selected ? "var(--accent)" : "var(--text-muted)",
          cursor: saving ? "wait" : "pointer",
          whiteSpace: "nowrap",
          maxWidth: 160,
          overflow: "hidden",
          textOverflow: "ellipsis",
          outline: "none",
        }}
      >
        <ShieldCheck size={12} style={{ flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textAlign: "left" }}>
          {saving ? "Saving…" : selected ? selected.label : "Assign"}
        </span>
        <ChevronDown size={11} style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.12s" }} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 60,
            width: "max(100%, 220px)",
            background: "var(--menu-bg)",
            border: "1px solid var(--panel-border)",
            borderRadius: 8,
            boxShadow: "var(--shadow-sm)",
            padding: 4,
          }}
        >
          <div style={{ position: "relative", marginBottom: 4 }}>
            <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search HITL..."
              style={{ width: "100%", padding: "7px 8px 7px 28px", fontSize: 12, border: "1px solid var(--input-border)", borderRadius: 6, background: "var(--input-bg)", color: "var(--foreground)", outline: "none" }}
            />
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            <div
              role="button"
              onClick={() => assign(null)}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = !currentIdStr ? "var(--input-bg)" : "transparent"; }}
              style={{ ...menuItemBaseStyle(!currentIdStr), color: "var(--text-muted)", fontSize: 12 }}
            >
              Unassign
            </div>
            {filtered.length === 0 ? (
              <div style={{ padding: "8px 10px", fontSize: 12, color: "var(--text-muted)" }}>No HITL users</div>
            ) : (
              filtered.map((u) => (
                <div
                  key={u.id}
                  role="button"
                  onClick={() => assign(u.id)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = String(u.id) === currentIdStr ? "var(--input-bg)" : "transparent"; }}
                  style={{ ...menuItemBaseStyle(String(u.id) === currentIdStr), display: "flex", flexDirection: "column", gap: 1 }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>{u.label}</span>
                  <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "ui-monospace, monospace" }}>{u.email}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── HITL status styles (shared) ─────────────────────────── */
const STATUS_STYLES = {
  COMPLETED:      { label: "Completed",      bg: "rgba(34,197,94,0.12)",  color: "#22c55e" },
  PENDING:        { label: "Pending",        bg: "rgba(234,179,8,0.12)",  color: "#eab308" },
  QUEUED:         { label: "Pending",        bg: "rgba(234,179,8,0.12)",  color: "#eab308" },
  PROCESSING:     { label: "Processing",     bg: "rgba(255,109,142,0.16)", color: "#ffd6e1" },
  TO_BE_TESTED:   { label: "To Be Tested",  bg: "rgba(249,115,22,0.12)", color: "#f97316" },
  FAILED:         { label: "Failed",         bg: "rgba(239,68,68,0.12)",  color: "#ef4444" },
};

const STATUS_OPTIONS = [
  { value: "COMPLETED",    label: "Completed" },
  { value: "PENDING",      label: "Pending" },
  { value: "PROCESSING",   label: "Processing" },
  { value: "TO_BE_TESTED", label: "To Be Tested" },
];

/* ── Per-row HITL status dropdown ────────────────────────── */
function StatusDropCell({ docId, currentStatus, onStatusChanged }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function choose(val) {
    if (val === currentStatus) { setOpen(false); return; }
    setSaving(true);
    setOpen(false);
    try {
      const res = await axios.post(`/api/document/${encodeURIComponent(docId)}/update-status`, { status: val });
      if (res.data?.ok === false) {
        toast.error(res.data.error || "Failed to update status");
        return;
      }
      onStatusChanged(docId, val);
      toast.success("Status updated");
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to update status");
    } finally {
      setSaving(false);
    }
  }

  const s = STATUS_STYLES[currentStatus?.toUpperCase()] || { label: currentStatus || "—", bg: "var(--tag-bg)", color: "var(--text-muted)" };

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={saving}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 9px",
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.04em",
          background: s.bg,
          color: s.color,
          border: `1px solid ${s.color}33`,
          cursor: saving ? "wait" : "pointer",
          whiteSpace: "nowrap",
          outline: "none",
          transition: "opacity 0.15s",
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? "…" : s.label}
        <ChevronDown
          size={10}
          style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.12s" }}
        />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 70,
            width: 160,
            background: "var(--menu-bg)",
            border: "1px solid var(--panel-border)",
            borderRadius: 8,
            boxShadow: "var(--shadow-sm)",
            padding: 4,
          }}
        >
          {STATUS_OPTIONS.map((st) => {
            const ss = STATUS_STYLES[st.value];
            const active = st.value === currentStatus;
            return (
              <div
                key={st.value}
                role="button"
                onClick={() => choose(st.value)}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = active ? "var(--input-bg)" : "transparent"; }}
                style={{
                  ...menuItemBaseStyle(active),
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: ss?.color || "var(--text-muted)",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: "var(--foreground)" }}>
                  {st.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Missing fields row ───────────────────────────────────── */
function MissingFieldRow({ doc, onView, hitlUsers, onAssigned, onStatusChanged, canAssign }) {
  const [hovered, setHovered] = useState(false);
  const nullFields = doc.missing_fields || [];

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(200px, 1.2fr) 180px 1fr 130px 140px 130px 180px 90px",
        gap: 16,
        alignItems: "center",
        padding: "14px 20px",
        borderBottom: "1px solid var(--panel-border)",
        background: hovered ? "var(--input-bg)" : "transparent",
        transition: "background 0.15s",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 3, overflow: "hidden" }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--accent)",
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={doc.result_id ?? doc.id}
        >
          {doc.result_id ?? doc.id}
        </span>
        {doc.request_id && (
          <span
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={doc.request_id}
          >
            {doc.request_id}
          </span>
        )}
      </div>

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

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <FileWarning size={14} style={{ color: "var(--text-muted)" }} />
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {nullFields.length} field{nullFields.length !== 1 ? "s" : ""}
          {nullFields.length > 0 ? " missing:" : ""}
        </span>
        {nullFields.length > 0 && (
          <span style={{ fontSize: 12, color: "var(--foreground)", fontWeight: 500 }}>
            {nullFields.slice(0, 3).join(", ")}
            {nullFields.length > 3 && ` +${nullFields.length - 3} more`}
          </span>
        )}
      </div>

      <StatusDropCell
        docId={doc.id}
        currentStatus={doc.hitl_status}
        onStatusChanged={onStatusChanged}
      />

      <ValidationDot validation={doc.validation} />

      <span
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        title={doc.created_at || ""}
      >
        {formatDate(doc.created_at)}
      </span>

      <HitlAssignCell
        docId={doc.id}
        currentId={doc.hitl_assigned_to}
        hitlUsers={hitlUsers}
        onAssigned={onAssigned}
        canAssign={canAssign}
      />

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
          background: "var(--brand-gradient)",
          color: "#fff",
          border: "none",
          cursor: "pointer",
          boxShadow: hovered ? "0 4px 12px rgba(20,14,53,0.26)" : "none",
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
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const canAssign = emailCanAssign(user?.email || "");

  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState("");
  const [clientId, setClientId] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [hitlUserId, setHitlUserId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [validationFilter, setValidationFilter] = useState("");
  const [showAll, setShowAll] = useState(true);
  const [docs, setDocs] = useState([]);

  useEffect(() => { initTheme(); }, [initTheme]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["missing-fields", "all"],
    queryFn: async () => {
      const res = await axios.get(`/api/missing-fields?showAll=true`);
      return res.data.documents || [];
    },
    staleTime: 0,
    refetchInterval: 20 * 1000,
    refetchOnWindowFocus: true,
    onError: () => toast.error("Failed to load documents"),
  });

  const { data: filterOptions } = useQuery({
    queryKey: ["filter-options"],
    queryFn: async () => {
      const res = await axios.get("/api/filter-options");
      return res.data;
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: hitlData } = useQuery({
    queryKey: ["hitl-users"],
    queryFn: async () => {
      const res = await axios.get("/api/hitl-users");
      return res.data.users || [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const hitlUsers = hitlData || [];

  // seed local docs state from query result so we can update assignments optimistically
  useEffect(() => { if (data) setDocs(data); }, [data]);

  const documents = docs.length ? docs : (data || []);
  const clientOptions = (filterOptions?.clients || []).map((c) => ({
    value: c.id,
    label: c.label,
    sublabel: c.email,
  }));
  const businessOptions = (filterOptions?.businesses || []).map((b) => ({
    value: b,
    label: b,
  }));

  const docTypes = useMemo(() => {
    return [...new Set(documents.map((d) => d.ocr_document_type).filter(Boolean))];
  }, [documents]);

  const visibleDocuments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents.filter((doc) => {
      if (docType && doc.ocr_document_type !== docType) return false;
      if (clientId && doc.client_id !== clientId) return false;
      if (businessName && doc.business_name !== businessName) return false;
      if (hitlUserId && doc.hitl_assigned_to !== hitlUserId) return false;
      if (statusFilter && (doc.hitl_status || "") !== statusFilter) return false;
      if (validationFilter && String(doc.validation) !== validationFilter) return false;
      if (!showAll && (doc.missing_count || 0) === 0) return false;
      if (!q) return true;
      return (
        String(doc.result_id ?? doc.id ?? "").toLowerCase().includes(q) ||
        String(doc.transaction_id || "").toLowerCase().includes(q) ||
        String(doc.request_id || "").toLowerCase().includes(q) ||
        String(doc.ocr_document_type || "").toLowerCase().includes(q) ||
        matchesDate(doc.created_at, q) ||
        matchesDate(doc.submitted_at, q) ||
        matchesDate(doc.updated_at, q)
      );
    });
  }, [documents, search, docType, clientId, businessName, hitlUserId, statusFilter, validationFilter, showAll]);

  const handleView = (docId) => {
    setActiveId(docId);
    router.push(`/view/${encodeURIComponent(docId)}`);
  };

  const handleAssigned = (docId, userId) => {
    setDocs((prev) =>
      prev.map((d) =>
        d.id === docId
          ? { ...d, hitl_assigned_to: userId, hitl_status: userId ? "PENDING" : null }
          : d
      )
    );
    queryClient.invalidateQueries({ queryKey: ["missing-fields", "all"] });
  };

  const handleStatusChanged = (docId, newStatus) => {
    setDocs((prev) =>
      prev.map((d) => d.id === docId ? { ...d, hitl_status: newStatus } : d)
    );
    queryClient.invalidateQueries({ queryKey: ["missing-fields", "all"] });
  };

  const hasFilters = search || docType || clientId || businessName || hitlUserId || statusFilter || validationFilter;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--background)" }}>
      <Navbar />

      <main style={{ flex: 1, padding: "32px 40px" }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: showAll
                  ? "var(--brand-gradient)"
                  : "linear-gradient(135deg, #ff5778 0%, #d43d6f 100%)",
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
            flexWrap: "wrap",
          }}
        >
          {/* Document Type */}
          <SearchableDropdown
            placeholder="All Types"
            searchPlaceholder="Search type..."
            emptyText="No types"
            options={docTypes.map((t) => ({ value: t, label: t }))}
            value={docType}
            onChange={setDocType}
          />

          {/* Client */}
          <SearchableDropdown
            icon={UserCircle}
            placeholder="All Clients"
            searchPlaceholder="Search client..."
            emptyText="No clients"
            options={clientOptions}
            value={clientId}
            onChange={setClientId}
          />

          {/* Business */}
          <SearchableDropdown
            icon={Building2}
            placeholder="All Companies"
            searchPlaceholder="Search company..."
            emptyText="No companies"
            options={businessOptions}
            value={businessName}
            onChange={setBusinessName}
          />

          {/* Status */}
          <SearchableDropdown
            placeholder="All Statuses"
            searchPlaceholder="Search status..."
            emptyText="No statuses"
            options={[
              { value: "COMPLETED",    label: "Completed" },
              { value: "PENDING",      label: "Pending" },
              { value: "PROCESSING",   label: "Processing" },
              { value: "TO_BE_TESTED", label: "To Be Tested" },
              { value: "FAILED",       label: "Failed" },
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          {/* Validation */}
          <SearchableDropdown
            placeholder="All Validations"
            searchPlaceholder="Search validation..."
            emptyText="No validations"
            options={[
              { value: "true",  label: "Valid" },
              { value: "false", label: "To Be Tested" },
            ]}
            value={validationFilter}
            onChange={setValidationFilter}
          />

          {/* HITL */}
          <SearchableDropdown
            icon={ShieldCheck}
            placeholder="HITL: All"
            searchPlaceholder="Search HITL..."
            emptyText="No HITL users"
            options={hitlUsers.map((u) => ({ value: u.id, label: u.label, sublabel: u.email }))}
            value={hitlUserId}
            onChange={setHitlUserId}
          />

          {/* Search */}
          <div style={{ flex: 1, minWidth: 220, position: "relative" }}>
            <Search
              size={16}
              style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}
            />
            <input
              type="text"
              placeholder="Search by result ID, request ID, transaction ID, document type..."
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

          {hasFilters && (
            <button
              onClick={() => { setSearch(""); setDocType(""); setClientId(""); setBusinessName(""); setHitlUserId(""); setStatusFilter(""); setValidationFilter(""); }}
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
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(200px, 1.2fr) 180px 1fr 130px 140px 130px 180px 90px",
              gap: 16,
              padding: "12px 20px",
              background: "var(--input-bg)",
              borderBottom: "1px solid var(--panel-border)",
            }}
          >
            {["Result ID", "Document Type", "Missing Fields", "HITL Status", "Validation", "Created At", "HITL", "Action"].map((h, i) => (
              <span
                key={i}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--text-muted)",
                  textAlign: i === 6 ? "center" : "left",
                }}
              >
                {h}
              </span>
            ))}
          </div>

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
                  {hasFilters
                    ? "Try adjusting your filters"
                    : showAll
                    ? "No documents available"
                    : "All documents have complete data!"}
                </p>
              </div>
            ) : (
              visibleDocuments.map((doc) => (
                <MissingFieldRow key={doc.id} doc={doc} onView={handleView} hitlUsers={hitlUsers} onAssigned={handleAssigned} onStatusChanged={handleStatusChanged} canAssign={canAssign} />
              ))
            )}
          </div>

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
              Showing {visibleDocuments.length} of {documents.length} document
              {documents.length !== 1 ? "s" : ""}
              {!showAll && " with missing fields"}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
