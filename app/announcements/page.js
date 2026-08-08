"use client";

import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import toast from "react-hot-toast";
import { Megaphone, Paperclip, FileText, Image as ImageIcon, Trash2, Send, X, ChevronDown, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import Navbar from "@/components/Navbar/Navbar";
import RichBodyEditor from "@/components/Announcements/RichBodyEditor";

export const dynamic = "force-dynamic";

// Status tags an announcement can carry, each with its own dot color.
const STATUSES = [
  { value: "Active", color: "#3b82f6" },        // blue — ongoing
  { value: "Resolved", color: "#22c55e" },      // green — done
  { value: "Maintenance", color: "#f59e0b" },   // amber
  { value: "Release Note", color: "#a855f7" },  // purple
  { value: "Documentation", color: "#14b8a6" }, // teal
];
const STATUS_COLOR = Object.fromEntries(STATUSES.map((s) => [s.value, s.color]));

function StatusTag({ status }) {
  if (!status) return null;
  const color = STATUS_COLOR[status] || "#64748b";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "3px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 600, color, background: `${color}1f`, whiteSpace: "nowrap" }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 7px ${color}, 0 0 3px ${color}` }} />
      {status}
    </span>
  );
}

function formatDate(v) {
  if (!v) return "";
  try { return new Date(v).toLocaleString(); } catch { return String(v); }
}

function Attachment({ a }) {
  const url = `/api/announcements/attachments/${a.id}`;
  const isImage = (a.contentType || "").startsWith("image/");
  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noreferrer" style={{ display: "block" }}>
        <img
          src={url}
          alt={a.filename}
          style={{ maxWidth: "100%", maxHeight: 360, borderRadius: 8, border: "1px solid var(--panel-border)" }}
        />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 12px",
        border: "1px solid var(--panel-border)", borderRadius: 8, background: "var(--input-bg)",
        color: "var(--foreground)", fontSize: 13, textDecoration: "none",
      }}
    >
      {(a.contentType || "").includes("pdf") ? <FileText size={15} /> : <Paperclip size={15} />}
      {a.filename}
      <span style={{ color: "var(--text-muted)" }}>({Math.round((a.size || 0) / 1024)} KB)</span>
    </a>
  );
}

export default function AnnouncementsPage() {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const isSuperUser = user && user.roles?.includes("SUPER_ADMIN");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState(""); // plain text and/or raw HTML tags, typed directly
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState("Active");
  const [announcedAt, setAnnouncedAt] = useState(""); // datetime-local; blank = now
  const [posting, setPosting] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const fileRef = useRef(null);

  // Body may be plain text, HTML tags, or a mix — strip tags to check whether
  // there's any real text before treating it as content worth posting.
  const bodyHasText = (html) => {
    if (typeof document === "undefined") return !!html?.trim();
    const div = document.createElement("div");
    div.innerHTML = html || "";
    return (div.textContent || "").trim().length > 0;
  };

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => (await axios.get("/api/announcements")).data.announcements || [],
    enabled: !authLoading,
  });

  const addFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...picked]);
    if (fileRef.current) fileRef.current.value = "";
  };
  const removeFile = (i) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const post = async () => {
    if (!title.trim() && !bodyHasText(body) && files.length === 0) {
      toast.error("Add a title, text, or a file first");
      return;
    }
    setPosting(true);
    try {
      const fd = new FormData();
      fd.append("title", title);
      fd.append("body", body);
      fd.append("status", status);
      // datetime-local has no timezone; convert to an ISO instant. Blank => now (server-side).
      if (announcedAt) fd.append("announcedAt", new Date(announcedAt).toISOString());
      files.forEach((f) => fd.append("files", f));
      await axios.post("/api/announcements", fd);
      setTitle(""); setBody(""); setFiles([]); setStatus("Active"); setAnnouncedAt("");
      toast.success("Announcement posted");
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to post");
    } finally {
      setPosting(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this announcement?")) return;
    try {
      await axios.delete(`/api/announcements/${id}`);
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    } catch {
      toast.error("Failed to delete");
    }
  };

  const changeStatus = async (id, newStatus) => {
    try {
      await axios.patch(`/api/announcements/${id}`, { status: newStatus || null });
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    } catch {
      toast.error("Failed to update status");
    }
  };

  if (authLoading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <Navbar />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-primary)" }}>
      <Navbar />
      <main style={{ flex: 1, padding: "24px 28px", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <Megaphone size={22} style={{ color: "var(--accent, #2563eb)" }} />
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>Announcements</h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>Updates from the team</p>
          </div>
        </div>

        {/* Composer — SUPER_ADMIN only */}
        {isSuperUser && (
          <div style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 16, marginBottom: 24, background: "var(--panel-bg, var(--input-bg))" }}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              style={{ width: "100%", padding: "10px 12px", marginBottom: 10, fontSize: 15, fontWeight: 600,
                background: "var(--input-bg)", border: "1px solid var(--panel-border)", borderRadius: 8, color: "var(--foreground)" }}
            />
            <RichBodyEditor
              value={body}
              onChange={setBody}
              placeholder="Write your announcement… (text, links, email addresses — anything)"
            />
            {files.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                {files.map((f, i) => (
                  <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px",
                    background: "var(--input-bg)", border: "1px solid var(--panel-border)", borderRadius: 8, fontSize: 12, color: "var(--foreground)" }}>
                    {f.type.startsWith("image/") ? <ImageIcon size={13} /> : <FileText size={13} />}
                    {f.name}
                    <button onClick={() => removeFile(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 0 }}>
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {/* Status + date/time */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  style={{ padding: "8px 10px", fontSize: 13, background: "var(--input-bg)", border: "1px solid var(--panel-border)", borderRadius: 8, color: "var(--foreground)" }}
                >
                  {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.value}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Date &amp; time (optional)</label>
                <input
                  type="datetime-local"
                  value={announcedAt}
                  onChange={(e) => setAnnouncedAt(e.target.value)}
                  style={{ padding: "8px 10px", fontSize: 13, background: "var(--input-bg)", border: "1px solid var(--panel-border)", borderRadius: 8, color: "var(--foreground)" }}
                />
                <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>defaults to now</span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: "var(--text-muted)" }}>
                <Paperclip size={15} /> Attach PDF / image
                <input ref={fileRef} type="file" accept="application/pdf,image/*" multiple onChange={addFiles} style={{ display: "none" }} />
              </label>
              <button
                onClick={post}
                disabled={posting}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 8,
                  background: "var(--accent, #2563eb)", color: "#fff", border: "none", cursor: posting ? "default" : "pointer",
                  fontSize: 14, fontWeight: 600, opacity: posting ? 0.6 : 1 }}
              >
                <Send size={15} /> {posting ? "Posting…" : "Post"}
              </button>
            </div>
          </div>
        )}

        {/* Feed */}
        {isLoading ? (
          <p style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : announcements.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No announcements yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {announcements.map((a) => {
              const open = expandedId === a.id;
              const hasDetail = !!a.body || a.attachments?.length > 0;
              return (
                <div key={a.id} style={{ border: "1px solid var(--panel-border)", borderRadius: 12, background: "var(--panel-bg, var(--input-bg))", overflow: "hidden" }}>
                  {/* Collapsed header — title, status, date. Click to expand. */}
                  <div
                    onClick={() => setExpandedId(open ? null : a.id)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", cursor: hasDetail ? "pointer" : "default" }}
                  >
                    <span style={{ color: "var(--text-muted)", flexShrink: 0, visibility: hasDetail ? "visible" : "hidden" }}>
                      {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--foreground)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {a.title || "(untitled)"}
                        </h3>
                        {isSuperUser ? (
                          <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <StatusTag status={a.status} />
                            <select
                              value={a.status || ""}
                              onChange={(e) => changeStatus(a.id, e.target.value)}
                              title="Change status"
                              style={{ fontSize: 11.5, padding: "3px 6px", borderRadius: 6, background: "var(--input-bg)", border: "1px solid var(--panel-border)", color: "var(--foreground)", cursor: "pointer" }}
                            >
                              <option value="">— none —</option>
                              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.value}</option>)}
                            </select>
                          </span>
                        ) : (
                          <StatusTag status={a.status} />
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
                        {a.created_by_email || "Admin"} · {formatDate(a.announced_at)}
                      </div>
                    </div>
                    {isSuperUser && (
                      <button title="Delete" onClick={(e) => { e.stopPropagation(); remove(a.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", flexShrink: 0 }}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>

                  {/* Expanded detail — body + attachments. */}
                  {open && hasDetail && (
                    <div style={{ padding: "0 18px 18px 48px", borderTop: "1px solid var(--panel-border)" }}>
                      {a.body && (
                        // Server-sanitized (allowlisted tags/styles only — see
                        // BODY_SANITIZE_OPTIONS in the API route) before storage,
                        // so this is safe to render as-is. white-space: pre-wrap
                        // keeps plain-typed line breaks intact alongside any
                        // literal HTML tags, which render as real formatting.
                        <div
                          style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 14, color: "var(--foreground)", margin: "14px 0 0", lineHeight: 1.55 }}
                          dangerouslySetInnerHTML={{ __html: a.body }}
                        />
                      )}
                      {a.attachments?.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 14 }}>
                          {a.attachments.map((att) => <Attachment key={att.id} a={att} />)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
