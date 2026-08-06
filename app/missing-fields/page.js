"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import axios from "axios";
import toast from "react-hot-toast";
import {
  Search,
  Eye,
  AlertCircle,
  FileWarning,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  ListFilter,
  Building2,
  UserCircle,
  ShieldCheck,
  Layers,
  Download,
  FileArchive,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import { useThemeStore, useDocumentStore } from "@/lib/store";
import { useAuth } from "@/lib/useAuth";
import { ISSUE_TYPES, BUG_STATUSES } from "@/lib/constants";
import Navbar from "@/components/Navbar/Navbar";
import ValidationDot from "@/components/Results/ValidationDot";
import BulkActionBar from "@/components/Grid/BulkActionBar";
import { bulkSetBugStatus, bulkSetHitlStatus, bulkAssignHitl } from "@/lib/bulkDocumentActions";

const HITL_ASSIGN_ALLOWED = ["financeai@financeai.com", "rashika@financeai.com"];
function emailCanAssign(email = "") {
  return HITL_ASSIGN_ALLOWED.includes(email.toLowerCase());
}

/* ── Sortable column header — click toggles asc/desc; sorts the full
   server-paginated result set, not just the rows on screen. ── */
const TABLE_HEADER_COLUMNS = [
  { label: "Action", key: null },
  { label: "Result ID", key: "result_id" },
  { label: "HITL Status", key: "hitl_status" },
  { label: "Validation", key: "validation" },
  { label: "HITL", key: null },
  { label: "Created At", key: "created_at" },
  { label: "Bug Status", key: "bug_status" },
  // { label: "Issue Type", key: "issue_type" },
  // { label: "Issue Description", key: "issue_description" },
  { label: "Document Type", key: "ocr_document_type" },
  { label: "Key Environment", key: "key_environment" },
  { label: "Missing Fields", key: "missing_count" },
];

// Single source of truth for both the header row and each MissingFieldRow
// below — a header/row template drift caused a real column-misalignment bug
// earlier, so this is shared rather than duplicated inline.
const ROW_GRID = "32px 90px minmax(200px, 1.2fr) 130px 140px 180px 130px 160px minmax(180px, 1.2fr) 180px 130px 1fr 130px";

function SortableHeaderCell({ label, sortKey, sortBy, sortOrder, onSort, align = "left" }) {
  const active = sortKey && sortBy === sortKey;
  return (
    <span
      role={sortKey ? "button" : undefined}
      onClick={sortKey ? () => onSort(sortKey) : undefined}
      style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: active ? "var(--foreground)" : "var(--text-muted)",
        textAlign: align,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: align === "center" ? "center" : "flex-start",
        gap: 4,
        width: "100%",
        cursor: sortKey ? "pointer" : "default",
        userSelect: "none",
      }}
    >
      {label}
      {sortKey && (active ? (
        sortOrder === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />
      ) : (
        <ArrowUpDown size={11} style={{ opacity: 0.4 }} />
      ))}
    </span>
  );
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
  { value: "FAILED",       label: "Failed" },
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

/* ── Bug status styles + per-row dropdown ────────────────────────────── */
const BUG_STATUS_STYLES = {
  OPEN:          { label: "Open",         bg: "rgba(239,68,68,0.12)",  color: "#ef4444" },
  TO_BE_TESTED:  { label: "To Be Tested", bg: "rgba(249,115,22,0.12)", color: "#f97316" },
  CLOSED:        { label: "Closed",       bg: "rgba(34,197,94,0.12)",  color: "#22c55e" },
};

function BugStatusDropCell({ docId, currentStatus, onBugStatusChanged }) {
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

  const s = BUG_STATUS_STYLES[currentStatus?.toUpperCase().replace(/\s+/g, "_")] || { label: currentStatus || "—", bg: "var(--tag-bg)", color: "var(--text-muted)" };

  async function choose(val) {
    if (val === currentStatus) { setOpen(false); return; }
    setSaving(true);
    setOpen(false);
    try {
      const res = await axios.post(`/api/document/${encodeURIComponent(docId)}/update-bug-tracking`, { bugStatus: val });
      if (res.data?.ok === false) {
        toast.error(res.data.error || "Failed to update bug status");
        return;
      }
      onBugStatusChanged(docId, val);
      toast.success("Bug status updated");
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to update bug status");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={saving}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 6,
          fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", background: s.bg, color: s.color,
          border: `1px solid ${s.color}33`, cursor: saving ? "wait" : "pointer", whiteSpace: "nowrap",
          outline: "none", transition: "opacity 0.15s", opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? "…" : s.label}
        <ChevronDown size={10} style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.12s" }} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 70, width: 150,
            background: "var(--menu-bg)", border: "1px solid var(--panel-border)", borderRadius: 8,
            boxShadow: "var(--shadow-sm)", padding: 4,
          }}
        >
          {BUG_STATUSES.map((val) => {
            const ss = BUG_STATUS_STYLES[val.toUpperCase().replace(/\s+/g, "_")];
            const active = val === currentStatus;
            return (
              <div
                key={val}
                role="button"
                onClick={() => choose(val)}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = active ? "var(--input-bg)" : "transparent"; }}
                style={{ ...menuItemBaseStyle(active), display: "flex", alignItems: "center", gap: 8 }}
              >
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: ss?.color || "var(--text-muted)", flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: "var(--foreground)" }}>{ss?.label || val}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
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

/* ── Missing fields row ───────────────────────────────────── */
function MissingFieldRow({ doc, onView, hitlUsers, onAssigned, onStatusChanged, onBugStatusChanged, canAssign, selected, onToggleSelect }) {
  const [hovered, setHovered] = useState(false);
  const nullFields = doc.missing_fields || [];

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "grid",
        gridTemplateColumns: ROW_GRID,
        gap: 16,
        alignItems: "center",
        padding: "14px 20px",
        borderBottom: "1px solid var(--panel-border)",
        background: hovered ? "var(--input-bg)" : "transparent",
        transition: "background 0.15s",
      }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect(doc.id)}
        style={{ cursor: "pointer" }}
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
        {/* View */}
      </button>

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

      <StatusDropCell
        docId={doc.id}
        currentStatus={doc.hitl_status}
        onStatusChanged={onStatusChanged}
      />

      <ValidationDot validation={doc.validation} />

      <HitlAssignCell
        docId={doc.id}
        currentId={doc.hitl_assigned_to}
        hitlUsers={hitlUsers}
        onAssigned={onAssigned}
        canAssign={canAssign}
      />
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

      <BugStatusDropCell
        docId={doc.id}
        currentStatus={doc.bug_status}
        onBugStatusChanged={onBugStatusChanged}
      />

      {/* <span
        style={{
          fontSize: 12,
          color: "var(--foreground)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={doc.issue_type || ""}
      >
        {doc.issue_type || "—"}
      </span>

      <span
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={doc.issue_description || ""}
      >
        {doc.issue_description || "—"}
      </span> */}

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

      <KeyEnvBadge env={doc.key_environment} />

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

    </div>
  );
}

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 350;

/* ── Main page ────────────────────────────────────────────── */
export default function MissingFieldsPage() {
  const { initTheme } = useThemeStore();
  const { setActiveId } = useDocumentStore();
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const canAssign = emailCanAssign(user?.email || "");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [docType, setDocType] = useState("");
  const [clientId, setClientId] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [hitlUserId, setHitlUserId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [validationFilter, setValidationFilter] = useState("");
  const [keyEnvironment, setKeyEnvironment] = useState("");
  const [bugStatusFilter, setBugStatusFilter] = useState("");
  const [issueTypeFilter, setIssueTypeFilter] = useState("");
  const [showAll, setShowAll] = useState(true);
  const [page, setPage] = useState(1);
  const [docs, setDocs] = useState([]);
  const [sortBy, setSortBy] = useState("");
  const [sortOrder, setSortOrder] = useState("desc");
  const [selectedIds, setSelectedIds] = useState(new Set());

  const handleSort = (key) => {
    if (sortBy === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortOrder("asc");
    }
  };

  useEffect(() => { initTheme(); }, [initTheme]);

  // Keep the input feeling instant while the network request trails behind.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  // A filter change can strand the user on a page number past the new
  // filtered total, so jump back to page 1 whenever any filter changes.
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [debouncedSearch, docType, clientId, businessName, statusFilter, keyEnvironment, bugStatusFilter, issueTypeFilter, hitlUserId, validationFilter, showAll, sortBy, sortOrder]);

  // A new page of rows means the previous selection no longer corresponds
  // to what's on screen.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["missing-fields", { debouncedSearch, docType, clientId, businessName, statusFilter, keyEnvironment, bugStatusFilter, issueTypeFilter, hitlUserId, validationFilter, showAll, sortBy, sortOrder, page }],
    queryFn: async () => {
      const res = await axios.get("/api/missing-fields", {
        params: {
          showAll,
          search: debouncedSearch,
          docType,
          clientId,
          businessName,
          status: statusFilter,
          keyEnvironment,
          // bugStatus: bugStatusFilter,
          // issueType: issueTypeFilter,
          hitlUserId,
          validation: validationFilter,
          sortBy,
          sortOrder,
          page,
          pageSize: PAGE_SIZE,
        },
      });
      return res.data;
    },
    placeholderData: keepPreviousData,
    staleTime: 15 * 1000,
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
  useEffect(() => { if (data) setDocs(data.documents || []); }, [data]);

  const documents = docs.length ? docs : (data?.documents || []);
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const clientOptions = (filterOptions?.clients || []).map((c) => ({
    value: c.id,
    label: c.label,
    sublabel: c.email,
  }));
  const businessOptions = [
    { value: "NULL", label: "No Company" },
    ...(filterOptions?.businesses || []).map((b) => ({ value: b, label: b })),
  ];
  const docTypes = filterOptions?.docTypes || [];
  const keyEnvironments = filterOptions?.keyEnvironments || [];

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

  const handleBugStatusChanged = (docId, newStatus) => {
    setDocs((prev) =>
      prev.map((d) => d.id === docId ? { ...d, bug_status: newStatus } : d)
    );
    queryClient.invalidateQueries({ queryKey: ["missing-fields", "all"] });
  };

  const toggleSelectOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.size === documents.length ? new Set() : new Set(documents.map((d) => d.id))
    );
  };

  const bulkActions = [
    {
      key: "bugStatus",
      label: "Bug Status",
      placeholder: "Bug status…",
      options: BUG_STATUSES.map((s) => ({ value: s, label: s })),
      confirmText: (value, count) => `Set bug status to "${value}" for ${count} selected document(s)?`,
      run: (value, onProgress) =>
        bulkSetBugStatus([...selectedIds], value, { onProgress }).then((result) => {
          setSelectedIds(new Set());
          queryClient.invalidateQueries({ queryKey: ["missing-fields", "all"] });
          return result;
        }),
    },
    {
      key: "hitlStatus",
      label: "HITL Status",
      placeholder: "HITL status…",
      options: STATUS_OPTIONS,
      confirmText: (value, count) => `Set HITL status to "${value}" for ${count} selected document(s)?`,
      run: (value, onProgress) =>
        bulkSetHitlStatus([...selectedIds], value, { onProgress }).then((result) => {
          setSelectedIds(new Set());
          queryClient.invalidateQueries({ queryKey: ["missing-fields", "all"] });
          return result;
        }),
    },
    ...(canAssign
      ? [
          {
            key: "hitlAssign",
            label: "HITL Assign",
            placeholder: "Assign to…",
            options: hitlUsers.map((u) => ({ value: u.id, label: u.label })),
            confirmText: (value, count) => {
              const user = hitlUsers.find((u) => String(u.id) === String(value));
              return `Assign ${count} selected document(s) to ${user?.label || value}?`;
            },
            run: (value, onProgress) =>
              bulkAssignHitl([...selectedIds], value, { onProgress }).then((result) => {
                setSelectedIds(new Set());
                queryClient.invalidateQueries({ queryKey: ["missing-fields", "all"] });
                return result;
              }),
          },
        ]
      : []),
  ];

  const hasFilters = search || docType || clientId || businessName || hitlUserId || statusFilter || validationFilter || keyEnvironment || bugStatusFilter || issueTypeFilter;

  const exportParams = {
    showAll: String(showAll),
    search: debouncedSearch,
    docType,
    clientId,
    businessName,
    status: statusFilter,
    keyEnvironment,
    bugStatus: bugStatusFilter,
    issueType: issueTypeFilter,
    hitlUserId,
    validation: validationFilter,
  };
  const exportUrl = `/api/missing-fields/export?${new URLSearchParams(exportParams).toString()}`;
  const downloadDocumentsUrl = `/api/missing-fields/download-documents?${new URLSearchParams(exportParams).toString()}`;

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
              { value: "null",  label: "Unknown"}
            ]}
            value={validationFilter}
            onChange={setValidationFilter}
          />

          {/* Key Environment */}
          <SearchableDropdown
            icon={Layers}
            placeholder="All Key Environments"
            searchPlaceholder="Search environment..."
            emptyText="No environments"
            options={keyEnvironments.map((e) => ({ value: e, label: e }))}
            value={keyEnvironment}
            onChange={setKeyEnvironment}
          />

          {/* HITL */}
          <SearchableDropdown
            icon={ShieldCheck}
            placeholder="HITL: All"
            searchPlaceholder="Search HITL..."
            emptyText="No HITL users"
            options={[{ value: "UNASSIGNED", label: "Unassigned" }, ...hitlUsers.map((u) => ({ value: u.id, label: u.label, sublabel: u.email }))]}
            value={hitlUserId}
            onChange={setHitlUserId}
          />

          {/* Bug Status */}
          {/* <SearchableDropdown
            placeholder="All Bug Statuses"
            searchPlaceholder="Search bug status..."
            emptyText="No bug statuses"
            options={BUG_STATUSES.map((s) => ({ value: s, label: s }))}
            value={bugStatusFilter}
            onChange={setBugStatusFilter}
          /> */}

          {/* Issue Type */}
          {/* <SearchableDropdown
            placeholder="All Issue Types"
            searchPlaceholder="Search issue type..."
            emptyText="No issue types"
            options={ISSUE_TYPES.map((t) => ({ value: t, label: t }))}
            value={issueTypeFilter}
            onChange={setIssueTypeFilter}
          /> */}

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
              onClick={() => { setSearch(""); setDocType(""); setClientId(""); setBusinessName(""); setHitlUserId(""); setStatusFilter(""); setValidationFilter(""); setKeyEnvironment(""); setBugStatusFilter(""); setIssueTypeFilter(""); }}
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

          <a
            href={downloadDocumentsUrl}
            title="Downloads a zip of the source documents for up to the first 100 rows matching the current filters"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              border: "1px solid var(--panel-border)",
              background: "var(--input-bg)",
              color: "var(--foreground)",
              cursor: "pointer",
              textDecoration: "none",
            }}
          >
            <FileArchive size={13} />
            Download Documents
          </a>
        </div>

        <BulkActionBar selectedCount={selectedIds.size} onClear={() => setSelectedIds(new Set())} actions={bulkActions} />

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
          {/* Header and rows share one horizontal scroll container so a
              column's header can never drift out of line with its cells —
              scrolling the body scrolls the header by the same amount since
              they're the same scroll box, not two independent ones. */}
          <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: "max-content" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: ROW_GRID,
              gap: 16,
              padding: "12px 20px",
              background: "var(--input-bg)",
              borderBottom: "1px solid var(--panel-border)",
            }}
          >
            <input
              type="checkbox"
              checked={documents.length > 0 && selectedIds.size === documents.length}
              onChange={toggleSelectAll}
              style={{ cursor: "pointer" }}
            />
            {TABLE_HEADER_COLUMNS.map((col) => (
              <SortableHeaderCell
                key={col.label}
                label={col.label}
                sortKey={col.key}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                align={col.label === "HITL" ? "center" : "left"}
              />
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
            ) : documents.length === 0 ? (
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
              documents.map((doc) => (
                <MissingFieldRow key={doc.id} doc={doc} onView={handleView} hitlUsers={hitlUsers} onAssigned={handleAssigned} onStatusChanged={handleStatusChanged} onBugStatusChanged={handleBugStatusChanged} canAssign={canAssign} selected={selectedIds.has(doc.id)} onToggleSelect={toggleSelectOne} />
              ))
            )}
          </div>
          </div>
          </div>

          {documents.length > 0 && (
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
                Page {page} of {totalPages} · {total} document{total !== 1 ? "s" : ""}
                {!showAll && " with missing fields"}
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
