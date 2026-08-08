"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Plus, Trash2, MessageSquare, History } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Navbar from "@/components/Navbar/Navbar";

export const dynamic = "force-dynamic";

// Prebuilt prompts shown on the empty state.
const SUGGESTED_PROMPTS = [
  "Summarize the documents processed this week.",
  "Which documents failed validation, and why?",
  "How does the HITL review workflow work?",
  "What do the bug-tracker statuses mean?",
  "Draft a note explaining a re-processed invoice.",
  "What can DEXAI Satori help me with?",
];

async function fetchConversations() {
  const res = await fetch("/api/satori/conversations");
  if (!res.ok) throw new Error("Failed to load conversations");
  const data = await res.json();
  return data.conversations || [];
}

async function fetchConversation(id) {
  const res = await fetch(`/api/satori/conversations/${id}`);
  if (!res.ok) throw new Error("Failed to load conversation");
  const data = await res.json();
  return data.conversation;
}

async function sendToSatori({ conversationId, message }) {
  const res = await fetch("/api/satori/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, message }),
  });
  if (!res.ok) throw new Error("Satori request failed");
  return res.json(); // { conversationId, reply }
}

async function removeConversation(id) {
  const res = await fetch(`/api/satori/conversations/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete conversation");
}

export default function SatoriPage() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const taRef = useRef(null);

  // Load the conversation list once; auto-select the most recent.
  useEffect(() => {
    fetchConversations()
      .then((list) => {
        setConversations(list);
        if (list[0]?.id) selectConversation(list[0].id);
      })
      .catch(() => {});
  }, []);

  // Keep the thread scrolled to the newest message.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  const selectConversation = (id) => {
    setActiveId(id);
    setMessagesLoading(true);
    fetchConversation(id)
      .then((conv) => {
        setMessages(
          (conv?.messages || []).map((m) => ({
            role: m.role,
            content: m.content,
            at: new Date(m.created_at).getTime(),
          }))
        );
      })
      .catch(() => setMessages([]))
      .finally(() => setMessagesLoading(false));
  };

  const startNewChat = () => {
    setActiveId(null);
    setMessages([]);
    setInput("");
    taRef.current?.focus();
  };

  const deleteConversation = (id, e) => {
    e?.stopPropagation();
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
    removeConversation(id).catch(() => {});
  };

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setInput("");

    const userMsg = { role: "user", content, at: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);
    try {
      const { conversationId, reply } = await sendToSatori({ conversationId: activeId, message: content });
      const botMsg = { role: "assistant", content: reply, at: Date.now() };
      setMessages((prev) => [...prev, botMsg]);
      if (conversationId !== activeId) setActiveId(conversationId);
      fetchConversations().then(setConversations).catch(() => {});
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong reaching Satori. Please try again.", at: Date.now() },
      ]);
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg-primary)" }}>
      <Navbar />

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* ── History sidebar ── */}
        <aside style={{ width: 270, flexShrink: 0, borderRight: "1px solid var(--panel-border)", display: "flex", flexDirection: "column", background: "var(--panel-bg, var(--input-bg))" }}>
          <div style={{ padding: 14 }}>
            <button
              onClick={startNewChat}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px 14px", borderRadius: 10, border: "1px solid var(--panel-border)", background: "var(--input-bg)", color: "var(--foreground)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              <Plus size={16} /> New chat
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 18px 8px", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            <History size={13} /> History
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 10px 12px" }}>
            {conversations.length === 0 ? (
              <p style={{ padding: "8px 8px", fontSize: 12.5, color: "var(--text-muted)" }}>No conversations yet.</p>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.id}
                  onClick={() => selectConversation(c.id)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 8, cursor: "pointer", marginBottom: 2, background: c.id === activeId ? "var(--input-bg)" : "transparent", border: c.id === activeId ? "1px solid var(--panel-border)" : "1px solid transparent" }}
                >
                  <MessageSquare size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.title}
                  </span>
                  <button title="Delete" onClick={(e) => deleteConversation(c.id, e)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", flexShrink: 0, padding: 0, display: "flex" }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* ── Chat area ── */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "24px 0" }}>
            {messagesLoading ? (
              <div style={{ padding: "40px 24px", textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>
                Loading conversation…
              </div>
            ) : messages.length === 0 && !sending ? (
              // Empty state: brand + prebuilt prompts.
              <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px", textAlign: "center" }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--brand-gradient, #2563eb)", boxShadow: "0 10px 30px rgba(37,99,235,0.35)" }}>
                  <Sparkles size={26} color="#fff" />
                </div>
                <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--foreground)", margin: "0 0 6px" }}>DEXAI Satori</h1>
                <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 28px" }}>Ask anything about your documents, results, and workflows.</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, textAlign: "left" }}>
                  {SUGGESTED_PROMPTS.map((p) => (
                    <button
                      key={p}
                      onClick={() => send(p)}
                      style={{ padding: "14px 16px", borderRadius: 12, border: "1px solid var(--panel-border)", background: "var(--input-bg)", color: "var(--foreground)", fontSize: 13.5, textAlign: "left", cursor: "pointer", lineHeight: 1.45 }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ maxWidth: 820, margin: "0 auto", padding: "0 24px", display: "flex", flexDirection: "column", gap: 18 }}>
                {messages.map((m, i) => (
                  <MessageBubble key={i} role={m.role} content={m.content} />
                ))}
                {sending && <MessageBubble role="assistant" content="…" typing />}
              </div>
            )}
          </div>

          {/* ── Composer ── */}
          <div style={{ borderTop: "1px solid var(--panel-border)", padding: "14px 24px", background: "var(--bg-primary)" }}>
            <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", alignItems: "flex-end", gap: 10, border: "1px solid var(--panel-border)", borderRadius: 14, background: "var(--input-bg)", padding: "8px 8px 8px 14px" }}>
              <textarea
                ref={taRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Message DEXAI Satori…"
                style={{ flex: 1, resize: "none", maxHeight: 160, background: "transparent", border: "none", outline: "none", color: "var(--foreground)", fontSize: 14.5, lineHeight: 1.5, padding: "8px 0" }}
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || sending}
                title="Send"
                style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 10, border: "none", cursor: !input.trim() || sending ? "default" : "pointer", background: !input.trim() || sending ? "var(--panel-border)" : "var(--brand-gradient, #2563eb)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <Send size={17} />
              </button>
            </div>
            <p style={{ maxWidth: 820, margin: "8px auto 0", fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
              DEXAI Satori can make mistakes. Please verify important information.
            </p>
          </div>
        </main>
      </div>
      <style jsx global>{`
        .satori-md > *:first-child { margin-top: 0; }
        .satori-md > *:last-child { margin-bottom: 0; }
        .satori-md p { margin: 0 0 10px; }
        .satori-md h1, .satori-md h2, .satori-md h3, .satori-md h4 {
          margin: 16px 0 8px; font-weight: 700; line-height: 1.3;
        }
        .satori-md h1 { font-size: 1.25em; }
        .satori-md h2 { font-size: 1.15em; }
        .satori-md h3 { font-size: 1.05em; }
        .satori-md h4 { font-size: 1em; }
        .satori-md ul, .satori-md ol { margin: 0 0 10px; padding-left: 22px; }
        .satori-md li { margin: 3px 0; }
        .satori-md li > p { margin: 0; }
        .satori-md strong { font-weight: 700; }
        .satori-md em { font-style: italic; }
        .satori-md hr { margin: 14px 0; border: none; border-top: 1px solid currentColor; opacity: 0.15; }
        .satori-md a { color: inherit; text-decoration: underline; }
        .satori-md code {
          font-family: ui-monospace, SFMono-Regular, monospace; font-size: 0.9em;
          background: rgba(127, 127, 127, 0.2); border-radius: 4px; padding: 2px 5px;
        }
        .satori-md pre {
          background: rgba(127, 127, 127, 0.15); border-radius: 8px; padding: 10px 12px;
          overflow-x: auto; margin: 0 0 10px;
        }
        .satori-md pre code { background: none; padding: 0; }
        .satori-md table { border-collapse: collapse; margin: 0 0 10px; font-size: 0.95em; }
        .satori-md th, .satori-md td { border: 1px solid rgba(127, 127, 127, 0.35); padding: 4px 8px; }
        .satori-md th { font-weight: 700; }
      `}</style>
    </div>
  );
}

// Renders assistant replies (and user messages) as markdown — the model
// consistently answers with headings/bold/lists/code, and showing that
// literally (### Step-by-step, **bold**, etc.) as plain text reads as broken.
function MessageMarkdown({ content }) {
  return (
    <div className="satori-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function MessageBubble({ role, content, typing }) {
  const isUser = role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      {!isUser && (
        <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, marginRight: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--brand-gradient, #2563eb)" }}>
          <Sparkles size={15} color="#fff" />
        </div>
      )}
      <div
        style={{
          maxWidth: "78%",
          padding: "11px 15px",
          borderRadius: 14,
          fontSize: 14.5,
          lineHeight: 1.55,
          wordBreak: "break-word",
          background: isUser ? "var(--brand-gradient, #2563eb)" : "var(--input-bg)",
          color: isUser ? "#fff" : "var(--foreground)",
          border: isUser ? "none" : "1px solid var(--panel-border)",
        }}
      >
        {typing ? <TypingDots /> : <MessageMarkdown content={content} />}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center", height: 18 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-muted)", animation: `satori-blink 1.2s ${i * 0.2}s infinite ease-in-out` }}
        />
      ))}
      <style jsx>{`
        @keyframes satori-blink { 0%, 80%, 100% { opacity: 0.25; } 40% { opacity: 1; } }
      `}</style>
    </span>
  );
}
