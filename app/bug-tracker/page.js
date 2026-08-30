"use client";

import { useEffect, useMemo, useState, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import axios from "axios";
import toast from "react-hot-toast";
import { useAuth } from "@/lib/useAuth";

// HITL reviewers land on this client's data by default; they can change it.

import {
  Search,
  Eye,
  Pencil,
  AlertCircle,
  Bug,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Download,
  FileArchive,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  MessageSquare,
  Lock,
  ScrollText,
} from "lucide-react";
import { useThemeStore, useDocumentStore } from "@/lib/store";
import { canViewRequestLogs } from "@/lib/requestLogsAccess";
import RequestLogsModal from "@/components/Logs/RequestLogsModal";
import { ISSUE_TYPES, BUG_STATUSES, ACTION_STATUSES } from "@/lib/constants";
import Navbar from "@/components/Navbar/Navbar";
import MultiSelectDropdown from "@/components/Filters/MultiSelectDropdown";
import CommentsPanel from "@/components/Comments/CommentsPanel";
import BulkActionBar from "@/components/Grid/BulkActionBar";
import { bulkSetBugStatus, bulkSetActionStatus } from "@/lib/bulkDocumentActions";

export const dynamic = "force-dynamic";

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

const menuItemBaseStyle = (active) => ({
  padding: "8px 10px",
  borderRadius: 6,
  cursor: "pointer",
  background: active ? "var(--input-bg)" : "transparent",
});

/* ── Sortable column header — click toggles asc/desc; sorts the full
   server-paginated result set, not just the rows on screen. ── */
const getHeaderColumns = (showLogs) => [
  { label: "Edit", key: null },
  { label: "View", key: null },
  ...(showLogs ? [{ label: "Logs", key: null }] : []),
  { label: "Bug ID", key: "bug_tracker_id" },
  { label: "Result ID", key: "result_id" },
  { label: "Bug Status", key: "bug_status" },
  { label: "Action Status", key: "action_status" },
  { label: "Client Email", key: "client_email" },
  { label: "Type", key: "ocr_document_type" },
  { label: "Bug Created At", key: "bug_flagged_at" },
  { label: "Comments", key: null },
];

function SortableHeaderCell({ label, sortKey, sortBy, sortOrder, onSort }) {
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
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        cursor: sortKey ? "pointer" : "default",
        userSelect: "none",
        whiteSpace: "nowrap",
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

/* ── Single-select dropdown (same pattern already duplicated per-page
   in missing-fields/page.js and dexai/[userId]/page.js) ────────────── */
function SearchableDropdown({
  icon: Icon,
  placeholder,
  searchPlaceholder = "Search...",
  value,
  options,
  onChange,
  emptyText = "No options found",
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

  const selected = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.label.toLowerCase().includes(q))
    : options;

  function choose(val) {
    onChange(val);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 160 }}>
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
                  style={menuItemBaseStyle(o.value === value)}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {o.label}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Bug status styles + per-row dropdown (SUPER_ADMIN only) ────────── */
const BUG_STATUS_STYLES = {
  OPEN:         { label: "Open",         bg: "rgba(239,68,68,0.12)",  color: "#ef4444" },
  TO_BE_TESTED: { label: "To Be Tested", bg: "rgba(249,115,22,0.12)", color: "#f97316" },
  CLOSED:       { label: "Closed",       bg: "rgba(34,197,94,0.12)",  color: "#22c55e" },
};

function bugStyleFor(status) {
  if (!status) return { label: "—", bg: "var(--tag-bg)", color: "var(--text-muted)" };
  const key = String(status).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return BUG_STATUS_STYLES[key] || { label: status === "TO_BE_TESTED" ? "To Be Tested" : status, bg: "var(--tag-bg)", color: "var(--text-muted)" };
}

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

  const s = bugStyleFor(currentStatus);

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
        style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 6, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", background: s.bg, color: s.color, border: `1px solid ${s.color}33`, cursor: saving ? "wait" : "pointer", whiteSpace: "nowrap", outline: "none", opacity: saving ? 0.6 : 1 }}
      >
        {saving ? "…" : s.label}
        <ChevronDown size={10} style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.12s" }} />
      </button>

      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 70, minWidth: 150, width: "max-content", background: "var(--menu-bg)", border: "1px solid var(--panel-border)", borderRadius: 8, boxShadow: "var(--shadow-sm)", padding: 4 }}>
          {BUG_STATUSES.map((val) => {
            const ss = bugStyleFor(val);
            const active = val === currentStatus;
            return (
              <div
                key={val}
                role="button"
                onClick={() => choose(val)}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = active ? "var(--input-bg)" : "transparent"; }}
                style={{ padding: "8px 10px", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, background: active ? "var(--input-bg)" : "transparent", whiteSpace: "nowrap" }}
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

/* ── Action status styles + per-row dropdown (Enhancement, Model Tuning, Invalid doc, Tech Issue) ── */
const ACTION_STATUS_STYLES = {
  ENHANCEMENT:  { label: "Enhancement",  bg: "rgba(59,130,246,0.12)",  color: "#3b82f6" },
  MODEL_TUNING: { label: "Model Tuning", bg: "rgba(168,85,247,0.12)", color: "#a855f7" },
  INVALID_DOC:  { label: "Invalid doc",  bg: "rgba(148,163,184,0.12)", color: "#94a3b8" },
  TECH_ISSUE:   { label: "Tech Issue",   bg: "rgba(249,115,22,0.12)",  color: "#f97316" },
};

function actionStyleFor(action) {
  if (!action || action === "None") return { label: "None", bg: "var(--input-bg)", color: "var(--text-muted)" };
  const key = String(action).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return ACTION_STATUS_STYLES[key] || { label: action, bg: "var(--tag-bg)", color: "var(--text-muted)" };
}

function ActionStatusDropCell({ docId, currentStatus, onActionStatusChanged }) {
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

  const s = actionStyleFor(currentStatus);

  async function choose(val) {
    if (val === currentStatus || (!val && !currentStatus)) { setOpen(false); return; }
    setSaving(true);
    setOpen(false);
    try {
      const res = await axios.post(`/api/document/${encodeURIComponent(docId)}/update-bug-tracking`, { actionStatus: val || null });
      if (res.data?.ok === false) {
        toast.error(res.data.error || "Failed to update action status");
        return;
      }
      onActionStatusChanged(docId, val || null);
      toast.success("Action status updated");
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to update action status");
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
          border: currentStatus ? `1px solid ${s.color}33` : "1px solid var(--panel-border)",
          cursor: saving ? "wait" : "pointer",
          whiteSpace: "nowrap",
          outline: "none",
          opacity: saving ? 0.6 : 1,
        }}
      >
        {currentStatus && <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: s.color, flexShrink: 0 }} />}
        {saving ? "…" : s.label}
        <ChevronDown size={10} style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.12s" }} />
      </button>

      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 70, minWidth: 200, width: "max-content", background: "var(--menu-bg)", border: "1px solid var(--panel-border)", borderRadius: 8, boxShadow: "var(--shadow-sm)", padding: 4 }}>
          <div
            role="button"
            onClick={() => choose(null)}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = !currentStatus ? "var(--input-bg)" : "transparent"; }}
            style={{ padding: "8px 10px", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, background: !currentStatus ? "var(--input-bg)" : "transparent", whiteSpace: "nowrap", color: "var(--text-muted)", fontSize: 12, fontWeight: !currentStatus ? 700 : 500 }}
          >
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--text-muted)", opacity: 0.5, flexShrink: 0 }} />
            <span>None</span>
          </div>
          {ACTION_STATUSES.map((val) => {
            const ss = actionStyleFor(val);
            const active = val === currentStatus;
            return (
              <div
                key={val}
                role="button"
                onClick={() => choose(val)}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = active ? "var(--input-bg)" : "transparent"; }}
                style={{ padding: "8px 10px", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, background: active ? "var(--input-bg)" : "transparent", whiteSpace: "nowrap" }}
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

/* ── Edit modal ("layover") ───────────────────────────────────────── */
function EditBugModal({ row, onClose, onSaved }) {
  const [issueType, setIssueType] = useState(row.issue_type || "");
  const [issueDescription, setIssueDescription] = useState(row.issue_description || "");
  const [bugStatusVal, setBugStatusVal] = useState(row.bug_status || "");
  const [actionStatusVal, setActionStatusVal] = useState(row.action_status || "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const patch = {
        issueType: issueType || null,
        issueDescription: issueDescription || null,
        bugStatus: bugStatusVal || null,
        actionStatus: actionStatusVal || null,
      };

      const res = await axios.post(`/api/document/${encodeURIComponent(row.result_id)}/update-bug-tracking`, patch);
      if (res.data?.ok === false) {
        toast.error(res.data.error || "Failed to save");
        return;
      }
      onSaved(row.id, res.data);
      toast.success("Saved");
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const fieldStyle = {
    fontSize: 13,
    padding: "9px 12px",
    borderRadius: 8,
    border: "1px solid var(--input-border)",
    background: "var(--input-bg)",
    color: "var(--foreground)",
    width: "100%",
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.4)" }} />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 100,
          width: "min(520px, calc(100vw - 40px))",
          maxHeight: "calc(100vh - 60px)",
          overflowY: "auto",
          background: "var(--panel-bg)",
          border: "1px solid var(--panel-border)",
          borderRadius: 14,
          boxShadow: "var(--shadow-md)",
          padding: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>Edit Bug</h2>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>
              {row.request_id}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: "1px solid var(--panel-border)", background: "var(--input-bg)", color: "var(--text-muted)", cursor: "pointer" }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Issue Type</label>
            <select value={issueType} disabled={saving} onChange={(e) => setIssueType(e.target.value)} style={fieldStyle}>
              <option value="">—</option>
              {ISSUE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Issue Description</label>
            <textarea
              value={issueDescription}
              disabled={saving}
              onChange={(e) => setIssueDescription(e.target.value)}
              rows={4}
              style={{ ...fieldStyle, resize: "vertical" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Bug Status</label>
            <select value={bugStatusVal} disabled={saving} onChange={(e) => setBugStatusVal(e.target.value)} style={fieldStyle}>
              <option value="" disabled>—</option>
              {BUG_STATUSES.map((s) => (
                <option key={s} value={s}>{bugStyleFor(s).label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Action Status</label>
            <select value={actionStatusVal} disabled={saving} onChange={(e) => setActionStatusVal(e.target.value)} style={fieldStyle}>
              <option value="">— None —</option>
              {ACTION_STATUSES.map((s) => (
                <option key={s} value={s}>{actionStyleFor(s).label}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{ padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "1px solid var(--panel-border)", background: "var(--input-bg)", color: "var(--foreground)", cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", background: "var(--brand-gradient)", color: "#fff", cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </>
  );
}

/* ── Comments modal ───────────────────────────────────────────────── */
function CommentsModal({ row, onClose, onCommentsChanged }) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.4)" }} />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 100,
          width: "min(520px, calc(100vw - 40px))",
          maxHeight: "calc(100vh - 60px)",
          overflowY: "auto",
          background: "var(--panel-bg)",
          border: "1px solid var(--panel-border)",
          borderRadius: 14,
          boxShadow: "var(--shadow-md)",
          padding: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>Comments</h2>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0", fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>
              {row.request_id}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: "1px solid var(--panel-border)", background: "var(--input-bg)", color: "var(--text-muted)", cursor: "pointer" }}
          >
            <X size={14} />
          </button>
        </div>

        <CommentsPanel
          resultId={row.result_id}
          comments={row.comments || []}
          onCommentsChanged={(updated) => onCommentsChanged(row.id, updated)}
          height={300}
        />
      </div>
    </>
  );
}

/* ── Table row (11 or 12 columns: select, edit, view, [logs], bug_id, result_id, bug_status, action_status, client_email, doc_type, flagged_at, comments) ── */
const getRowGrid = (showLogs) =>
  showLogs
    ? "32px 36px 36px 36px 110px 150px 130px 150px 220px 140px 170px 80px"
    : "32px 36px 36px 110px 150px 130px 150px 220px 140px 170px 80px";

function BugTrackerRow({ doc, onView, onEdit, onLogs, showLogs, onViewComments, onBugStatusChanged, onActionStatusChanged, lockInfo, selected, onToggleSelect }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: "grid", gridTemplateColumns: getRowGrid(showLogs), gap: 16, alignItems: "center", padding: "14px 20px", borderBottom: "1px solid var(--panel-border)", background: hovered ? "var(--input-bg)" : "transparent", transition: "background 0.15s" }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect(doc.id)}
        style={{ cursor: "pointer" }}
      />

      <button
        onClick={() => onEdit(doc)}
        title="Edit"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, border: "1px solid var(--panel-border)", background: "var(--input-bg)", color: "var(--foreground)", cursor: "pointer" }}
      >
        <Pencil size={13} />
      </button>

      <button
        onClick={() => onView(doc.result_id)}
        disabled={doc.result_id == null}
        title="View Document"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, border: "none", background: doc.result_id == null ? "var(--input-bg)" : "var(--brand-gradient)", color: doc.result_id == null ? "var(--text-muted)" : "#fff", cursor: doc.result_id == null ? "not-allowed" : "pointer" }}
      >
        <Eye size={13} />
      </button>

      {showLogs && (
        <button
          onClick={() => onLogs(doc)}
          title="View Request Logs"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: 8,
            border: "1px solid rgba(168, 85, 247, 0.3)",
            background: "rgba(168, 85, 247, 0.15)",
            color: "var(--accent)",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(168, 85, 247, 0.25)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(168, 85, 247, 0.15)";
          }}
        >
          <ScrollText size={13} />
        </button>
      )}

      <span
        style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)", fontFamily: "ui-monospace, SFMono-Regular, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        title={doc.bug_tracker_id != null ? `BUG-${String(doc.bug_tracker_id).padStart(5, "0")}` : ""}
      >
        {doc.bug_tracker_id != null ? `BUG-${String(doc.bug_tracker_id).padStart(5, "0")}` : "—"}
      </span>

      <div style={{ display: "flex", flexDirection: "column", gap: 2, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {doc.result_id ? (
            <span
              style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", fontFamily: "ui-monospace, SFMono-Regular, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              title={doc.result_id}
            >
              {doc.result_id}
            </span>
          ) : (
            <span
              style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", fontFamily: "ui-monospace, SFMono-Regular, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              title={doc.request_id}
            >
              {doc.request_id}
            </span>
          )}
          {lockInfo && (
            <span
              title={`In use by ${lockInfo.userEmail || lockInfo.userName}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                fontSize: 10,
                fontWeight: 700,
                padding: "1px 6px",
                borderRadius: 99,
                background: "rgba(239, 68, 68, 0.15)",
                color: "#ef4444",
                whiteSpace: "nowrap",
              }}
            >
              <Lock size={10} /> In Use
            </span>
          )}
        </div>
      </div>

      <BugStatusDropCell docId={doc.result_id} currentStatus={doc.bug_status} onBugStatusChanged={onBugStatusChanged} />

      <ActionStatusDropCell docId={doc.result_id} currentStatus={doc.action_status} onActionStatusChanged={onActionStatusChanged} />

      <span style={{ fontSize: 12, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={doc.client_email || ""}>
        {doc.client_email || "—"}
      </span>
      <span style={{ fontSize: 12, fontWeight: 500, padding: "4px 10px", borderRadius: 6, background: "var(--tag-purple-bg)", color: "var(--tag-purple-color)", textAlign: "center", justifySelf: "start", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {doc.ocr_document_type || "Unknown"}
      </span>
      <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }} title={doc.bug_flagged_at ? formatDate(doc.bug_flagged_at) : "Not tracked (flagged before this column existed)"}>
        {doc.bug_flagged_at ? formatDate(doc.bug_flagged_at) : "—"}
      </span>

      <button
        onClick={() => onViewComments(doc)}
        title="View comments"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--panel-border)", background: "var(--input-bg)", color: "var(--foreground)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
      >
        <MessageSquare size={13} />
        {Array.isArray(doc.comments) && doc.comments.length > 0 ? doc.comments.length : ""}
      </button>
    </div>
  );
}

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 350;

/* ── Main page ────────────────────────────────────────────── */
export default function BugTrackerPage() {
  return (
    <Suspense fallback={null}>
      <BugTrackerContent />
    </Suspense>
  );
}

function BugTrackerContent() {
  const { initTheme } = useThemeStore();
  const { setActiveId } = useDocumentStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const showLogsOption = canViewRequestLogs(user);
  const [activeLogDoc, setActiveLogDoc] = useState(null);


  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchParams.get("search") || "");
  const [clientEmails, setClientEmails] = useState(() => {
    const v = searchParams.get("clientEmails");
    return v ? v.split(",").filter(Boolean) : [];
  });
  const [docType, setDocType] = useState(() => searchParams.get("docType") || "");
  const [issueType, setIssueType] = useState(() => searchParams.get("issueType") || "");
  const [bugStatusFilter, setBugStatusFilter] = useState(() => searchParams.get("bugStatus") || "");
  const [actionStatusFilter, setActionStatusFilter] = useState(() => searchParams.get("actionStatus") || "");
  const [page, setPage] = useState(() => Number(searchParams.get("page")) || 1);
  const [docs, setDocs] = useState([]);
  const [editingRow, setEditingRow] = useState(null);
  const [viewingCommentsRow, setViewingCommentsRow] = useState(null);
  const [sortBy, setSortBy] = useState(() => searchParams.get("sortBy") || "");
  const [sortOrder, setSortOrder] = useState(() => searchParams.get("sortOrder") || "desc");
  const [selectedIds, setSelectedIds] = useState(new Set());

  const { data: locksData } = useQuery({
    queryKey: ["document-locks"],
    queryFn: async () => (await axios.get("/api/document-locks")).data,
    refetchInterval: 3000,
  });
  const activeLocks = locksData?.locks || {};

  const handleSort = (key) => {
    if (sortBy === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortOrder("asc");
    }
  };

  useEffect(() => { initTheme(); }, [initTheme]);


  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const filtersMounted = useRef(false);
  useEffect(() => {
    if (!filtersMounted.current) {
      filtersMounted.current = true;
      return;
    }
    setPage(1);
    setSelectedIds(new Set());
  }, [debouncedSearch, clientEmails, docType, issueType, bugStatusFilter, actionStatusFilter, sortBy, sortOrder]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [page]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (clientEmails.length) params.set("clientEmails", clientEmails.join(","));
    if (docType) params.set("docType", docType);
    if (issueType) params.set("issueType", issueType);
    if (bugStatusFilter) params.set("bugStatus", bugStatusFilter);
    if (actionStatusFilter) params.set("actionStatus", actionStatusFilter);
    if (page > 1) params.set("page", String(page));
    if (sortBy) params.set("sortBy", sortBy);
    if (sortOrder && sortOrder !== "desc") params.set("sortOrder", sortOrder);
    const qs = params.toString();
    router.replace(qs ? `/bug-tracker?${qs}` : "/bug-tracker", { scroll: false });
  }, [debouncedSearch, clientEmails, docType, issueType, bugStatusFilter, actionStatusFilter, page, sortBy, sortOrder, router]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["bug-tracker", { debouncedSearch, clientEmails, docType, issueType, bugStatusFilter, actionStatusFilter, sortBy, sortOrder, page }],
    queryFn: async () => {
      const res = await axios.get("/api/bug-tracker", {
        params: {
          search: debouncedSearch,
          clientEmails: debouncedSearch ? "" : clientEmails.join(","),
          docType,
          issueType,
          bugStatus: bugStatusFilter,
          actionStatus: actionStatusFilter,
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
  });

  const { data: filterOptions } = useQuery({
    queryKey: ["filter-options"],
    queryFn: async () => (await axios.get("/api/filter-options")).data,
    staleTime: 10 * 60 * 1000,
  });

  useEffect(() => { if (data) setDocs(data.documents || []); }, [data]);

  const documents = docs.length ? docs : (data?.documents || []);
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const clientEmailOptions = useMemo(() => {
    const seen = new Set();
    const options = [];
    for (const c of filterOptions?.clients || []) {
      if (!c.email || seen.has(c.email)) continue;
      seen.add(c.email);
      options.push({ value: c.email, label: c.email });
    }
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [filterOptions?.clients]);
  const docTypeOptions = filterOptions?.docTypes || [];

  const handleView = (resultId) => {
    if (!resultId) return;
    const lock = activeLocks[String(resultId)];
    if (
      lock &&
      String(lock.userId) !== String(user?.id) &&
      lock.userEmail?.toLowerCase() !== user?.email?.toLowerCase()
    ) {
      toast.error(`Document is currently open by ${lock.userEmail || lock.userName}`);
    }
    setActiveId(resultId);
    router.push(`/view/${encodeURIComponent(resultId)}`);
  };

  const handleBugStatusChanged = (resultId, newStatus) => {
    setDocs((prev) => prev.map((d) => (d.result_id === resultId ? { ...d, bug_status: newStatus } : d)));
    queryClient.invalidateQueries({ queryKey: ["bug-tracker"] });
  };

  const handleActionStatusChanged = (resultId, newAction) => {
    setDocs((prev) => prev.map((d) => (d.result_id === resultId ? { ...d, action_status: newAction } : d)));
    queryClient.invalidateQueries({ queryKey: ["bug-tracker"] });
  };

  const handleEditSaved = (rowId, res) => {
    setDocs((prev) =>
      prev.map((d) =>
        d.id === rowId
          ? { ...d, issue_type: res.issue_type, issue_description: res.issue_description, bug_status: res.bug_status, action_status: res.action_status }
          : d
      )
    );
    queryClient.invalidateQueries({ queryKey: ["bug-tracker"] });
  };

  const handleCommentsChanged = (rowId, updatedComments) => {
    setDocs((prev) => prev.map((d) => (d.id === rowId ? { ...d, comments: updatedComments } : d)));
    setViewingCommentsRow((prev) => (prev && prev.id === rowId ? { ...prev, comments: updatedComments } : prev));
    queryClient.invalidateQueries({ queryKey: ["bug-tracker"] });
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
      options: BUG_STATUSES.map((s) => ({ value: s, label: bugStyleFor(s).label })),
      confirmText: (value, count) => `Set bug status to "${bugStyleFor(value).label}" for ${count} selected document(s)?`,
      run: (value, onProgress) =>
        bulkSetBugStatus([...selectedIds], value, { onProgress }).then((result) => {
          setSelectedIds(new Set());
          queryClient.invalidateQueries({ queryKey: ["bug-tracker"] });
          return result;
        }),
    },
    {
      key: "actionStatus",
      label: "Action Status",
      placeholder: "Action status…",
      options: [
        { value: "", label: "— Clear / None —" },
        ...ACTION_STATUSES.map((s) => ({ value: s, label: actionStyleFor(s).label })),
      ],
      confirmText: (value, count) =>
        value
          ? `Set action status to "${actionStyleFor(value).label}" for ${count} selected document(s)?`
          : `Clear action status for ${count} selected document(s)?`,
      run: (value, onProgress) =>
        bulkSetActionStatus([...selectedIds], value || null, { onProgress }).then((result) => {
          setSelectedIds(new Set());
          queryClient.invalidateQueries({ queryKey: ["bug-tracker"] });
          return result;
        }),
    },
  ];

  const hasFilters = search || clientEmails.length || docType || issueType || bugStatusFilter || actionStatusFilter;

  const exportParams = {
    search: debouncedSearch,
    clientEmails: debouncedSearch ? "" : clientEmails.join(","),
    docType,
    issueType,
    bugStatus: bugStatusFilter,
    actionStatus: actionStatusFilter,
    sortBy,
    sortOrder,
  };
  const exportUrl = `/api/bug-tracker/export?${new URLSearchParams(exportParams).toString()}`;
  const downloadDocumentsUrl = `/api/bug-tracker/download-documents?${new URLSearchParams(exportParams).toString()}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--background)" }}>
      <Navbar />

      <main style={{ flex: 1, padding: "32px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--brand-gradient)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Bug size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>Bug Tracker</h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
              Every document with an issue logged against it, across all companies.
            </p>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24, padding: 20, background: "var(--panel-bg)", border: "1px solid var(--panel-border)", borderRadius: 12, boxShadow: "var(--shadow-sm)", flexWrap: "wrap" }}>
          <MultiSelectDropdown
            placeholder="All Client Emails"
            searchPlaceholder="Search email..."
            emptyText="No clients"
            options={clientEmailOptions}
            values={clientEmails}
            onChange={setClientEmails}
          />

          <SearchableDropdown
            placeholder="All Document Types"
            searchPlaceholder="Search type..."
            emptyText="No types"
            options={docTypeOptions.map((t) => ({ value: t, label: t }))}
            value={docType}
            onChange={setDocType}
          />

          <SearchableDropdown
            placeholder="All Issue Types"
            searchPlaceholder="Search issue type..."
            emptyText="No issue types"
            options={ISSUE_TYPES.map((t) => ({ value: t, label: t }))}
            value={issueType}
            onChange={setIssueType}
          />

          <SearchableDropdown
            placeholder="All Bug Statuses"
            searchPlaceholder="Search bug status..."
            emptyText="No bug statuses"
            options={[...BUG_STATUSES.map((s) => ({ value: s, label: bugStyleFor(s).label })), { value: "NULL", label: "No Status" }]}
            value={bugStatusFilter}
            onChange={setBugStatusFilter}
          />

          <SearchableDropdown
            placeholder="All Action Statuses"
            searchPlaceholder="Search action status..."
            emptyText="No action statuses"
            options={[...ACTION_STATUSES.map((s) => ({ value: s, label: actionStyleFor(s).label })), { value: "NULL", label: "No Action" }]}
            value={actionStatusFilter}
            onChange={setActionStatusFilter}
          />

          <div style={{ flex: 1, minWidth: 240, position: "relative" }}>
            <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              type="text"
              placeholder="Search by request ID, result ID, transaction ID, document type, client..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", padding: "9px 12px 9px 38px", fontSize: 13, border: "1px solid var(--input-border)", borderRadius: 8, background: "var(--input-bg)", color: "var(--foreground)", outline: "none" }}
            />
          </div>

          {hasFilters && (
            <button
              onClick={() => { setSearch(""); setClientEmails([]); setDocType(""); setIssueType(""); setBugStatusFilter(""); setActionStatusFilter(""); }}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, border: "1px solid var(--panel-border)", background: "var(--input-bg)", color: "var(--text-muted)", cursor: "pointer" }}
            >
              <X size={13} />
              Clear
            </button>
          )}

          <a
            href={exportUrl}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "1px solid var(--panel-border)", background: "var(--brand-gradient)", color: "#fff", cursor: "pointer", textDecoration: "none" }}
          >
            <Download size={13} />
            Export CSV
          </a>

          <a
            href={downloadDocumentsUrl}
            title="Downloads a zip of the source documents for up to the first 100 rows matching the current filters"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "1px solid var(--panel-border)", background: "var(--input-bg)", color: "var(--foreground)", cursor: "pointer", textDecoration: "none" }}
          >
            <FileArchive size={13} />
            Download Documents
          </a>
        </div>

        <BulkActionBar selectedCount={selectedIds.size} onClear={() => setSelectedIds(new Set())} actions={bulkActions} />

        {/* Table */}
        <div style={{ background: "var(--panel-bg)", border: "1px solid var(--panel-border)", borderRadius: 12, boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: "max-content" }}>
          <div style={{ display: "grid", gridTemplateColumns: getRowGrid(showLogsOption), gap: 16, padding: "12px 20px", background: "var(--input-bg)", borderBottom: "1px solid var(--panel-border)" }}>
            <input
              type="checkbox"
              checked={documents.length > 0 && selectedIds.size === documents.length}
              onChange={toggleSelectAll}
              style={{ cursor: "pointer" }}
            />
            {getHeaderColumns(showLogsOption).map((col) => (
              <SortableHeaderCell
                key={col.label}
                label={col.label}
                sortKey={col.key}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
            ))}
          </div>

          <div style={{ maxHeight: "calc(100vh - 400px)", overflowY: "auto" }}>
            {isLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading bug tracker...</div>
            ) : error ? (
              <div style={{ padding: 40, textAlign: "center", color: "#ef4444" }}>
                <AlertCircle size={32} style={{ marginBottom: 12 }} />
                <p>Failed to load documents</p>
              </div>
            ) : documents.length === 0 ? (
              <div style={{ padding: 60, textAlign: "center" }}>
                <Bug size={40} style={{ color: "var(--text-muted)", marginBottom: 12 }} />
                <p style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)", marginBottom: 4 }}>No documents found</p>
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {hasFilters ? "Try adjusting your filters" : "No bugs tracked yet"}
                </p>
              </div>
            ) : (
              documents.map((doc) => (
                <BugTrackerRow
                  key={doc.id}
                  doc={doc}
                  onView={handleView}
                  onEdit={setEditingRow}
                  onLogs={(d) => setActiveLogDoc(d)}
                  showLogs={showLogsOption}
                  onViewComments={setViewingCommentsRow}
                  onBugStatusChanged={handleBugStatusChanged}
                  onActionStatusChanged={handleActionStatusChanged}
                  lockInfo={activeLocks[String(doc.id)] || activeLocks[String(doc.result_id)]}
                  selected={selectedIds.has(doc.id)}
                  onToggleSelect={toggleSelectOne}
                />
              ))
            )}
          </div>
          </div>
          </div>

          {documents.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, padding: "12px 20px", background: "var(--input-bg)", borderTop: "1px solid var(--panel-border)", fontSize: 12, color: "var(--text-muted)" }}>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--panel-border)", background: "var(--panel-bg)", color: "var(--foreground)", fontSize: 12, cursor: page <= 1 ? "not-allowed" : "pointer", opacity: page <= 1 ? 0.4 : 1 }}>
                <ChevronLeft size={14} /> Prev
              </button>
              <span>Page {page} of {totalPages} · {total} document{total !== 1 ? "s" : ""}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--panel-border)", background: "var(--panel-bg)", color: "var(--foreground)", fontSize: 12, cursor: page >= totalPages ? "not-allowed" : "pointer", opacity: page >= totalPages ? 0.4 : 1 }}>
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </main>

      {editingRow && (
        <EditBugModal
          row={editingRow}
          onClose={() => setEditingRow(null)}
          onSaved={handleEditSaved}
        />
      )}

      {viewingCommentsRow && (
        <CommentsModal
          row={viewingCommentsRow}
          onClose={() => setViewingCommentsRow(null)}
          onCommentsChanged={handleCommentsChanged}
        />
      )}

      {showLogsOption && (
        <RequestLogsModal
          requestId={activeLogDoc?.request_id || activeLogDoc?.result_id || activeLogDoc?.id}
          isOpen={!!activeLogDoc}
          onClose={() => setActiveLogDoc(null)}
          initialFilename={activeLogDoc?.original_filename || activeLogDoc?.result_id}
        />
      )}
    </div>
  );
}
