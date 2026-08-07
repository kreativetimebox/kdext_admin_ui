"use client";

import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import toast from "react-hot-toast";
import { Megaphone, Paperclip, FileText, Image as ImageIcon, Trash2, Send, X } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import Navbar from "@/components/Navbar/Navbar";

export const dynamic = "force-dynamic";

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
  const [body, setBody] = useState("");
  const [files, setFiles] = useState([]);
  const [posting, setPosting] = useState(false);
  const fileRef = useRef(null);

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
    if (!title.trim() && !body.trim() && files.length === 0) {
      toast.error("Add a title, text, or a file first");
      return;
    }
    setPosting(true);
    try {
      const fd = new FormData();
      fd.append("title", title);
      fd.append("body", body);
      files.forEach((f) => fd.append("files", f));
      await axios.post("/api/announcements", fd);
      setTitle(""); setBody(""); setFiles([]);
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
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your announcement… (text, links, email addresses — anything)"
              rows={5}
              style={{ width: "100%", padding: "10px 12px", fontSize: 14, resize: "vertical",
                background: "var(--input-bg)", border: "1px solid var(--panel-border)", borderRadius: 8, color: "var(--foreground)" }}
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
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {announcements.map((a) => (
              <div key={a.id} style={{ border: "1px solid var(--panel-border)", borderRadius: 12, padding: 18, background: "var(--panel-bg, var(--input-bg))" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    {a.title && <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--foreground)", margin: "0 0 4px" }}>{a.title}</h3>}
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      {a.created_by_email || "Admin"} · {formatDate(a.created_at)}
                    </div>
                  </div>
                  {isSuperUser && (
                    <button title="Delete" onClick={() => remove(a.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", flexShrink: 0 }}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                {a.body && (
                  <p style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 14, color: "var(--foreground)", margin: "12px 0 0", lineHeight: 1.55 }}>
                    {a.body}
                  </p>
                )}
                {a.attachments?.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 14 }}>
                    {a.attachments.map((att) => <Attachment key={att.id} a={att} />)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
