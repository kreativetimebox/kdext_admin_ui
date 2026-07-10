"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import toast from "react-hot-toast";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Check,
  Clock,
  Server,
  Box,
  FileText,
  FileWarning,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import Navbar from "@/components/Navbar/Navbar";

export const dynamic = "force-dynamic";

const CATEGORY_ICON = {
  container_down: Box,
  log_error: FileText,
  unreachable: Server,
  document_failed: FileWarning,
  document_stuck: FileWarning,
};

// Categories that are about a specific document/request, so their alert row
// links straight to that document's result page (container_name holds the
// request_id for these — see lib/alertMonitor.js).
const DOCUMENT_CATEGORIES = new Set(["document_failed", "document_stuck"]);

const SEVERITY_COLOR = {
  critical: "#ef4444",
  warning: "#f59e0b",
};

function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function formatTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div
      style={{
        flex: "1 1 200px",
        minWidth: 200,
        padding: 16,
        background: "var(--panel-bg, var(--input-bg))",
        border: "1px solid var(--panel-border)",
        borderRadius: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Icon size={16} style={{ color: color || "var(--text-muted)" }} />
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--foreground)" }}>{value}</div>
    </div>
  );
}

export default function AlertsPage() {
  const { user, loading: authLoading } = useAuth();
  const canView = user && user.roles?.some((r) => ["SUPER_ADMIN", "SERVER_MONITOR"].includes(r));
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("active"); // "active" | "resolved" | "all"
  const [resolving, setResolving] = useState(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["alerts-all"],
    queryFn: async () => (await axios.get("/api/alerts", { params: { status: "all" } })).data,
    enabled: canView === true && authLoading === false,
    refetchInterval: 15000,
  });

  const alerts = data?.alerts || [];
  const activeCritical = alerts.filter((a) => !a.resolved_at && a.severity === "critical").length;
  const activeWarning = alerts.filter((a) => !a.resolved_at && a.severity === "warning").length;
  const resolvedToday = alerts.filter((a) => a.resolved_at && isToday(a.resolved_at)).length;

  const visible =
    filter === "all" ? alerts : filter === "active" ? alerts.filter((a) => !a.resolved_at) : alerts.filter((a) => a.resolved_at);

  const resolveAlert = async (id) => {
    setResolving(id);
    try {
      await axios.post(`/api/alerts/${id}/resolve`);
      toast.success("Alert acknowledged");
      queryClient.invalidateQueries({ queryKey: ["alerts-all"] });
      // The navbar badge polls a separate query (components/Navbar/Navbar.jsx)
      // — invalidate it too so the badge count drops instantly instead of
      // waiting for its own 30s refetch interval.
      queryClient.invalidateQueries({ queryKey: ["alerts-summary-badge"] });
    } catch (e) {
      toast.error(e.response?.data?.error || "Failed to resolve alert");
    } finally {
      setResolving(null);
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
  if (!canView) {
    if (typeof window !== "undefined") {
      toast.error("Access denied.");
      window.location.href = "/";
    }
    return null;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-primary)" }}>
      <Navbar />
      <main style={{ flex: 1, padding: "24px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--foreground)", margin: 0, marginBottom: 6 }}>
              Alerts
            </h1>
            <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
              Automatic error detection across servers and the document-processing pipeline
            </p>
          </div>
          <button
            onClick={() => refetch()}
            style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
              background: "var(--input-bg)", border: "1px solid var(--panel-border)",
              borderRadius: 8, color: "var(--foreground)", cursor: "pointer", fontSize: 13,
            }}
          >
            <RefreshCw size={14} className={isFetching ? "spin" : ""} /> Refresh
          </button>
        </div>

        {error && (
          <div style={{ padding: 14, background: "#ef444422", border: "1px solid #ef4444", borderRadius: 8, color: "#ef4444", marginBottom: 16 }}>
            Failed to load alerts: {error.response?.data?.error || error.message}
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 22 }}>
          <StatCard icon={AlertTriangle} label="Active Critical" value={isLoading ? "…" : activeCritical} color="#ef4444" />
          <StatCard icon={AlertTriangle} label="Active Warning" value={isLoading ? "…" : activeWarning} color="#f59e0b" />
          <StatCard icon={CheckCircle2} label="Resolved Today" value={isLoading ? "…" : resolvedToday} color="#22c55e" />
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[
            { id: "active", label: "Active" },
            { id: "resolved", label: "Resolved" },
            { id: "all", label: "All" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setFilter(t.id)}
              style={{
                padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                border: "1px solid var(--panel-border)",
                background: filter === t.id ? "var(--accent, #2563eb)" : "var(--input-bg)",
                color: filter === t.id ? "#fff" : "var(--foreground)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ border: "1px solid var(--panel-border)", borderRadius: 10, overflow: "hidden" }}>
          {isLoading ? (
            <div style={{ padding: 20, color: "var(--text-muted)" }}>Loading…</div>
          ) : visible.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
              <CheckCircle2 size={22} style={{ marginBottom: 8, opacity: 0.5 }} />
              <div>No {filter === "all" ? "" : filter} alerts</div>
            </div>
          ) : (
            visible.map((a, i) => {
              const Icon = CATEGORY_ICON[a.category] || AlertTriangle;
              const color = SEVERITY_COLOR[a.severity] || "var(--text-muted)";
              return (
                <div
                  key={a.id}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px",
                    borderBottom: i < visible.length - 1 ? "1px solid var(--panel-border)" : "none",
                    opacity: a.resolved_at ? 0.6 : 1,
                  }}
                >
                  <div
                    style={{
                      width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: `${color}1a`, border: `1px solid ${color}33`,
                    }}
                  >
                    <Icon size={15} style={{ color }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span
                        style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase",
                          padding: "2px 8px", borderRadius: 99, background: `${color}1a`, color,
                        }}
                      >
                        {a.severity}
                      </span>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--foreground)" }}>
                        {a.message}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                      {DOCUMENT_CATEGORIES.has(a.category) ? (
                        <>
                          {a.detail}
                          {" · "}
                          <Link
                            href={`/dexai/result/${encodeURIComponent(a.container_name)}`}
                            style={{ color: "var(--accent)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 3 }}
                          >
                            View document <ExternalLink size={11} />
                          </Link>
                        </>
                      ) : (
                        <>
                          {a.server_name} {a.container_name ? `· ${a.container_name}` : ""} · {a.detail}
                        </>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <Clock size={11} />
                      First seen {formatTime(a.first_seen)} · Last seen {formatTime(a.last_seen)} · {a.occurrences}x
                      {a.resolved_at && ` · Resolved ${formatTime(a.resolved_at)}`}
                    </div>
                  </div>
                  {!a.resolved_at && (
                    <button
                      title="Acknowledge / resolve"
                      disabled={resolving === a.id}
                      onClick={() => resolveAlert(a.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
                        borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600,
                        background: "var(--input-bg)", border: "1px solid var(--panel-border)",
                        color: "var(--foreground)", flexShrink: 0,
                      }}
                    >
                      <Check size={13} /> Resolve
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </main>

      <style jsx>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
