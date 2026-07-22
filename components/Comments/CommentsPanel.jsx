"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { Pencil, Trash2, Send } from "lucide-react";
import { useAuth } from "@/lib/useAuth";

function formatTimestamp(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "";
  }
}

/**
 * Comment thread for one document_processing_requests row (keyed by
 * result_id). Shared between the document view page's Bug Tracking panel
 * and the Bug Tracker tab's comments modal — both need the same add/edit/
 * delete behavior against app/api/document/[id]/comments.
 */
export default function CommentsPanel({ resultId, comments, onCommentsChanged, height = 220 }) {
  const { user } = useAuth();
  const currentUserEmail = (user?.email || "").toLowerCase();
  const [localComments, setLocalComments] = useState(comments || []);
  const [newMessage, setNewMessage] = useState("");
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    setLocalComments(comments || []);
  }, [comments]);

  function applyUpdate(updated) {
    setLocalComments(updated);
    onCommentsChanged?.(updated);
  }

  async function handleAdd() {
    const message = newMessage.trim();
    if (!message || !resultId) return;
    setPosting(true);
    try {
      const res = await axios.post(`/api/document/${encodeURIComponent(resultId)}/comments`, { message });
      if (res.data?.ok === false) {
        toast.error(res.data.error || "Failed to post comment");
        return;
      }
      applyUpdate(res.data.comments);
      setNewMessage("");
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to post comment");
    } finally {
      setPosting(false);
    }
  }

  function startEdit(comment) {
    setEditingId(comment.id);
    setEditText(comment.message);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  async function saveEdit(id) {
    const message = editText.trim();
    if (!message || !resultId) return;
    setBusyId(id);
    try {
      const res = await axios.put(`/api/document/${encodeURIComponent(resultId)}/comments/${id}`, { message });
      if (res.data?.ok === false) {
        toast.error(res.data.error || "Failed to save comment");
        return;
      }
      applyUpdate(res.data.comments);
      cancelEdit();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to save comment");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id) {
    if (!resultId) return;
    setBusyId(id);
    try {
      const res = await axios.delete(`/api/document/${encodeURIComponent(resultId)}/comments/${id}`);
      if (res.data?.ok === false) {
        toast.error(res.data.error || "Failed to delete comment");
        return;
      }
      applyUpdate(res.data.comments);
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to delete comment");
    } finally {
      setBusyId(null);
    }
  }

  const fieldStyle = {
    fontSize: 13,
    padding: "8px 11px",
    borderRadius: 8,
    border: "1px solid var(--input-border)",
    background: "var(--input-bg)",
    color: "var(--foreground)",
    width: "100%",
    resize: "vertical",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Comments{localComments.length > 0 ? ` (${localComments.length})` : ""}
      </label>

      <div
        style={{
          height,
          overflowY: "auto",
          border: "1px solid var(--panel-border)",
          borderRadius: 8,
          background: "var(--panel-bg)",
        }}
      >
        {localComments.length === 0 ? (
          <div style={{ padding: 16, textAlign: "center", fontSize: 12.5, color: "var(--text-muted)", fontStyle: "italic" }}>
            No comments yet
          </div>
        ) : (
          localComments.map((c, i) => (
            <div
              key={c.id}
              style={{
                padding: "10px 12px",
                borderBottom: i < localComments.length - 1 ? "1px solid var(--panel-border)" : "none",
              }}
            >
              {editingId === c.id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={2}
                    autoFocus
                    style={fieldStyle}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => saveEdit(c.id)}
                      disabled={busyId === c.id}
                      style={{ padding: "5px 10px", fontSize: 11.5, fontWeight: 600, borderRadius: 6, border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer" }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={busyId === c.id}
                      style={{ padding: "5px 10px", fontSize: 11.5, fontWeight: 600, borderRadius: 6, border: "1px solid var(--panel-border)", background: "var(--input-bg)", color: "var(--foreground)", cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--foreground)" }}>{c.username}</span>
                    <span style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{formatTimestamp(c.timestamp)}</span>
                  </div>
                  <p style={{ margin: "4px 0 6px", fontSize: 13, color: "var(--foreground)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {c.message}
                  </p>
                  {(c.username || "").toLowerCase() === currentUserEmail && (
                    <div style={{ display: "flex", gap: 10 }}>
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        disabled={busyId === c.id}
                        title="Edit comment"
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-muted)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                      >
                        <Pencil size={11} /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        disabled={busyId === c.id}
                        title="Delete comment"
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#ef4444", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                      >
                        <Trash2 size={11} /> Delete
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))
        )}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <textarea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Add a comment…"
          rows={2}
          disabled={posting || !resultId}
          style={{ ...fieldStyle, flex: 1 }}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={posting || !newMessage.trim() || !resultId}
          title={!resultId ? "This document has no result_id yet" : undefined}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: 8,
            border: "none",
            background: "var(--accent)",
            color: "#fff",
            cursor: posting || !newMessage.trim() || !resultId ? "not-allowed" : "pointer",
            opacity: posting || !newMessage.trim() || !resultId ? 0.6 : 1,
            flexShrink: 0,
          }}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
