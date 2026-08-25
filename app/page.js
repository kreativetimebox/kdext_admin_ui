"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
  Database,
  FileSearch,
  Users,
  AlertCircle,
  ArrowRight,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  ShieldCheck,
  Sparkles,
  Building,
  Store,
  Bug,
  UserCircle,
} from "lucide-react";
import { useThemeStore } from "@/lib/store";
import { useAuth } from "@/lib/useAuth";
import Navbar from "@/components/Navbar/Navbar";
import MultiSelectDropdown from "@/components/Filters/MultiSelectDropdown";

const CLIENT_ROLES = ["CLIENT_ADMIN", "CLIENT_USER", "CLIENT"];

function formatNumber(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString();
}

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

function fullName(r) {
  const parts = [r?.user_first_name, r?.user_last_name].filter(Boolean);
  if (parts.length) return parts.join(" ");
  return r?.user_email || "—";
}

/* ── Stat tile ────────────────────────────────────────────── */
function StatTile({ icon: Icon, label, value, sub, color, loading }) {
  return (
    <div
      style={{
        position: "relative",
        background: "var(--panel-bg)",
        border: "1px solid var(--panel-border)",
        borderRadius: 16,
        padding: "20px 22px",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: `${color}1a`,
            border: `1px solid ${color}33`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={17} style={{ color }} />
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-muted)",
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 800,
          color: "var(--foreground)",
          lineHeight: 1.1,
          letterSpacing: 0,
        }}
      >
        {loading ? (
          <span
            className="skeleton"
            style={{
              display: "inline-block",
              width: 80,
              height: 28,
              borderRadius: 6,
            }}
          />
        ) : (
          formatNumber(value)
        )}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/* ── Action card ──────────────────────────────────────────── */
function ActionCard({ icon: Icon, title, description, color, href, badge }) {
  const [hovered, setHovered] = useState(false);
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(href)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        textAlign: "left",
        background: hovered
          ? `linear-gradient(135deg, var(--panel-bg) 0%, ${color}12 100%)`
          : "var(--panel-bg)",
        border: hovered
          ? `1px solid ${color}66`
          : "1px solid var(--panel-border)",
        boxShadow: hovered
          ? `0 12px 32px ${color}22, var(--shadow-sm)`
          : "var(--shadow-sm)",
        borderRadius: 16,
        padding: "26px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        cursor: "pointer",
        transition: "all 0.2s ease",
        width: "100%",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            background: `linear-gradient(135deg, ${color}26 0%, ${color}11 100%)`,
            border: `1px solid ${color}33`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: hovered ? "scale(1.06)" : "scale(1)",
            transition: "transform 0.2s ease",
          }}
        >
          <Icon size={20} style={{ color }} />
        </div>
        {badge && (
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              padding: "3px 10px",
              borderRadius: 99,
              background: `${color}1a`,
              color,
              border: `1px solid ${color}33`,
              letterSpacing: "0.05em",
              marginLeft: "auto",
            }}
          >
            {badge}
          </span>
        )}
      </div>
      <div>
        <p
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "var(--foreground)",
            margin: 0,
            marginBottom: 6,
          }}
        >
          {title}
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.65, color: "var(--text-muted)", margin: 0 }}>
          {description}
        </p>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          fontWeight: 600,
          color,
          marginTop: 4,
        }}
      >
        Open
        <ArrowRight
          size={13}
          style={{
            transition: "transform 0.2s",
            transform: hovered ? "translateX(4px)" : "translateX(0)",
          }}
        />
      </div>
    </button>
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
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.05em",
        padding: "2px 8px",
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

/* ── Bug tracker stats ────────────────────────────────────── */
const BUG_STATS_GRID = "1.4fr 0.8fr 0.8fr";
const DOC_TYPE_STATS_GRID = "1.8fr 0.7fr 0.9fr 0.9fr 0.8fr 1fr 0.7fr 0.7fr";

function BugStatsSection({ clientIds, onClientIdsChange, clientOptions, isClientRole }) {
  const { data, isLoading } = useQuery({
    queryKey: ["bug-tracker-stats", clientIds],
    queryFn: async () => {
      const res = await axios.get("/api/bug-tracker/stats", {
        params: { clientIds: clientIds.join(",") },
      });
      return res.data;
    },
    staleTime: 30 * 1000,
  });

  const totals = data?.totals || { open: 0, modelTuning: 0, reprocessing: 0, toBeTested: 0, invalidBadImageClosed: 0, closed: 0 };
  const byDocType = data?.byDocType || [];
  const totalIssues =
    (totals.open || 0) +
    (totals.modelTuning || 0) +
    (totals.reprocessing || 0) +
    (totals.toBeTested || 0) +
    (totals.invalidBadImageClosed || 0) +
    (totals.closed || 0);
  const pct = (n) => (totalIssues > 0 ? `${Math.round((n / totalIssues) * 100)}%` : "—");

  const totalsRows = [
    { label: "Open", value: totals.open || 0, color: "#ef4444" },
    { label: "Model Tuning", value: totals.modelTuning || 0, color: "#a855f7" },
    { label: "Reprocessing", value: totals.reprocessing || 0, color: "#06b6d4" },
    { label: "To Be Tested", value: totals.toBeTested || 0, color: "#f97316" },
    { label: "Invalid Bad Image Closed", value: totals.invalidBadImageClosed || 0, color: "#94a3b8" },
    { label: "Closed", value: totals.closed || 0, color: "#22c55e" },
  ];

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "0 0 16px", flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
          }}
        >
          Bug Tracker
        </span>
        <div style={{ flex: 1, height: 1, background: "var(--panel-border)" }} />
        {!isClientRole && (
          <MultiSelectDropdown
            icon={UserCircle}
            placeholder="All Clients"
            searchPlaceholder="Search client..."
            emptyText="No clients"
            options={clientOptions}
            values={clientIds}
            onChange={onClientIdsChange}
          />
        )}
      </div>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(280px, 1fr) minmax(360px, 2fr)",
          gap: 16,
          marginBottom: 36,
        }}
      >
        {/* Totals table */}
        <div
          style={{
            background: "var(--panel-bg)",
            border: "1px solid var(--panel-border)",
            borderRadius: 14,
            boxShadow: "var(--shadow-sm)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: BUG_STATS_GRID,
              gap: 12,
              padding: "11px 20px",
              background: "var(--input-bg)",
              borderBottom: "1px solid var(--panel-border)",
            }}
          >
            {["Status", "Count", "% of Issues"].map((h) => (
              <span
                key={h}
                style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}
              >
                {h}
              </span>
            ))}
          </div>

          {isLoading ? (
            <div style={{ padding: 30, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Loading...</div>
          ) : (
            <>
              {totalsRows.map((r) => (
                <div
                  key={r.label}
                  style={{ display: "grid", gridTemplateColumns: BUG_STATS_GRID, gap: 12, alignItems: "center", padding: "12px 20px", borderBottom: "1px solid var(--panel-border)" }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: r.color, flexShrink: 0 }} />
                    {r.label}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>{formatNumber(r.value)}</span>
                  <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{pct(r.value)}</span>
                </div>
              ))}
              <div style={{ display: "grid", gridTemplateColumns: BUG_STATS_GRID, gap: 12, alignItems: "center", padding: "12px 20px" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>Total</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>{formatNumber(totalIssues)}</span>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{totalIssues > 0 ? "100%" : "—"}</span>
              </div>
            </>
          )}
        </div>

        {/* By document type table */}
        <div
          style={{
            background: "var(--panel-bg)",
            border: "1px solid var(--panel-border)",
            borderRadius: 14,
            boxShadow: "var(--shadow-sm)",
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 640 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: DOC_TYPE_STATS_GRID,
                  gap: 12,
                  padding: "11px 20px",
                  background: "var(--input-bg)",
                  borderBottom: "1px solid var(--panel-border)",
                }}
              >
                {["Document Type", "Open", "Model Tuning", "Reprocess", "To Test", "Invalid Closed", "Closed", "Total"].map((h) => (
                  <span
                    key={h}
                    style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}
                  >
                    {h}
                  </span>
                ))}
              </div>

              {isLoading ? (
                <div style={{ padding: 30, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Loading...</div>
              ) : byDocType.length === 0 ? (
                <div style={{ padding: 30, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No tracked issues</div>
              ) : (
                byDocType.map((r) => (
                  <div
                    key={r.document_type}
                    style={{ display: "grid", gridTemplateColumns: DOC_TYPE_STATS_GRID, gap: 12, alignItems: "center", padding: "12px 20px", borderBottom: "1px solid var(--panel-border)" }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.document_type}
                    </span>
                    <span style={{ fontSize: 13, color: "#ef4444" }}>{formatNumber(r.open)}</span>
                    <span style={{ fontSize: 13, color: "#a855f7" }}>{formatNumber(r.modelTuning)}</span>
                    <span style={{ fontSize: 13, color: "#06b6d4" }}>{formatNumber(r.reprocessing)}</span>
                    <span style={{ fontSize: 13, color: "#f97316" }}>{formatNumber(r.toBeTested)}</span>
                    <span style={{ fontSize: 13, color: "#94a3b8" }}>{formatNumber(r.invalidBadImageClosed)}</span>
                    <span style={{ fontSize: 13, color: "#22c55e" }}>{formatNumber(r.closed)}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>
                      {formatNumber(
                        (r.open || 0) +
                        (r.modelTuning || 0) +
                        (r.reprocessing || 0) +
                        (r.toBeTested || 0) +
                        (r.invalidBadImageClosed || 0) +
                        (r.closed || 0)
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/* ── Home page ────────────────────────────────────────────── */
export default function HomePage() {
  const { initTheme } = useThemeStore();
  const router = useRouter();
  const { user } = useAuth();
  const isClientRole = (user?.roles || []).some((r) => CLIENT_ROLES.includes(r));

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  const { data, isLoading } = useQuery({
    queryKey: ["dexai", "overview"],
    queryFn: async () => {
      const res = await axios.get("/api/dexai/overview");
      return res.data;
    },
    staleTime: 60 * 1000,
  });

  // Only needed for the client-role page title ("Tech DexAI {Client Name}
  // Admin") — internal-staff roles never fetch this.
  const { data: ownClient } = useQuery({
    queryKey: ["dexai", "own-client", user?.clientId],
    queryFn: async () => (await axios.get(`/api/dexai/users/${user.clientId}`)).data,
    enabled: isClientRole && !!user?.clientId,
    staleTime: 5 * 60 * 1000,
  });
  const clientDisplayName =
    ownClient?.company_name ||
    [ownClient?.first_name, ownClient?.last_name].filter(Boolean).join(" ") ||
    ownClient?.email ||
    "";
  const pageTitle = isClientRole && clientDisplayName ? `Tech DexAI ${clientDisplayName} Admin` : "Tech DexAI Admin";

  const [bugStatsClientIds, setBugStatsClientIds] = useState([]);
  // Client-role users never see the cross-client filter dropdown, so their
  // own client list is never fetched — the stats API forces their scope
  // server-side regardless of what this state holds.
  const { data: filterOptions } = useQuery({
    queryKey: ["filter-options"],
    queryFn: async () => (await axios.get("/api/filter-options")).data,
    staleTime: 10 * 60 * 1000,
    enabled: !isClientRole,
  });
  const clientOptions = useMemo(
    () =>
      (filterOptions?.clients || []).map((c) => ({
        value: c.id,
        label: c.label,
        sublabel: c.email,
      })),
    [filterOptions?.clients]
  );

  // Default the filter to "everyone selected" once the client list loads.
  // Only runs once (via the ref guard) so a user manually clearing the
  // selection afterward isn't immediately reset back to all-selected.
  const clientFilterInitialized = useRef(false);
  useEffect(() => {
    if (isClientRole || clientFilterInitialized.current) return;
    if (clientOptions.length > 0) {
      setBugStatsClientIds(clientOptions.map((c) => c.value));
      clientFilterInitialized.current = true;
    }
  }, [clientOptions, isClientRole]);

  const overview = data?.overview;
  const recent = data?.recent || [];

  const successRate =
    overview && overview.total_requests > 0
      ? Math.round((overview.completed_requests / overview.total_requests) * 100)
      : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "var(--background)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Navbar />

      <main
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          maxWidth: 1500,
          margin: "0 auto",
          width: "100%",
          padding: "40px 40px 60px",
        }}
      >
        {/* ── Hero ── */}
        <section
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
            marginBottom: 36,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ position: "relative", display: "inline-flex" }}>
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 18,
                  background: "var(--brand-gradient)",
                  boxShadow:
                    "0 10px 30px rgba(20,14,53,0.28), 0 0 0 1px rgba(255,255,255,0.22)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                }}
              >
                <Database size={26} color="#fff" />
              </div>
            </div>
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  padding: "3px 11px",
                  borderRadius: 99,
                  background:
                    "linear-gradient(90deg, var(--tag-bg), var(--active-row))",
                  color: "var(--tag-color)",
                  border: "1px solid var(--active-border)",
                  marginBottom: 10,
                }}
              >
                <Sparkles size={11} />
                Admin Portal
              </div>
              <h1
                style={{
                  fontSize: "clamp(1.6rem, 3.4vw, 2.4rem)",
                  fontWeight: 800,
                  letterSpacing: 0,
                  lineHeight: 1.1,
                  margin: 0,
                  background: "var(--brand-gradient)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {pageTitle}
              </h1>
              <p
                style={{
                  fontSize: 13.5,
                  color: "var(--text-muted)",
                  margin: 0,
                  marginTop: 6,
                  maxWidth: 560,
                  lineHeight: 1.55,
                }}
              >
                Review, correct, and monitor document parsing results from the
                DexAI OCR pipeline.
              </p>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 16px",
              borderRadius: 99,
              background: "var(--tag-green-bg)",
              color: "var(--tag-green-color)",
              border: "1px solid var(--panel-border)",
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            <ShieldCheck size={14} />
            Pipeline online
            {successRate != null && (
              <span style={{ opacity: 0.8 }}>· {successRate}% success</span>
            )}
          </div>
        </section>

        {/* ── Stat tiles ── */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            marginBottom: 36,
          }}
        >
          <StatTile
            icon={Users}
            label="Users"
            value={overview?.users_count}
            sub={`${formatNumber(overview?.active_users_count)} active`}
            color="#ff6d8e"
            loading={isLoading}
          />
          {!isClientRole && (
            <>
              <StatTile
                icon={Building}
                label="Businesses"
                value={overview?.businesses_count}
                sub="registered"
                color="#8b5cf6"
                loading={isLoading}
              />
              <StatTile
                icon={Store}
                label="Clients"
                value={overview?.clients_count}
                sub="in system"
                color="#06b6d4"
                loading={isLoading}
              />
            </>
          )}
          <StatTile
            icon={Database}
            label="Total Requests"
            value={overview?.total_requests}
            sub={`${formatNumber(overview?.distinct_doc_types)} document types`}
            color="#c985ff"
            loading={isLoading}
          />
          <StatTile
            icon={CheckCircle2}
            label="Completed"
            value={overview?.completed_requests}
            sub={successRate != null ? `${successRate}% success rate` : "—"}
            color="#059669"
            loading={isLoading}
          />
          <StatTile
            icon={XCircle}
            label="Failed"
            value={overview?.failed_requests}
            sub={`${formatNumber(overview?.pending_requests)} in progress`}
            color="#dc2626"
            loading={isLoading}
          />
        </section>

        {/* ── Bug tracker stats ── */}
        <BugStatsSection
          clientIds={bugStatsClientIds}
          onClientIdsChange={setBugStatsClientIds}
          clientOptions={clientOptions}
          isClientRole={isClientRole}
        />

        {/* ── Action cards ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            margin: "0 0 16px",
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
            }}
          >
            Quick Actions
          </span>
          <div style={{ flex: 1, height: 1, background: "var(--panel-border)" }} />
        </div>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
            marginBottom: 36,
          }}
        >
          <ActionCard
            icon={Users}
            color="#ff6d8e"
            title="DexAI Users"
            description="Browse all DexAI users and view their document processing results from the main finance database."
            href="/dexai"
            badge="Primary"
          />
          <ActionCard
            icon={FileSearch}
            color="#c985ff"
            title="Manual Analyzer"
            description="Open the OCR result analyzer to review and correct extracted fields side-by-side with the source file."
            href="/analyzer"
          />
          <ActionCard
            icon={AlertCircle}
            color="#d97706"
            title="Missing Fields"
            description="Find documents whose parsed result is missing mandatory fields and needs manual correction."
            href="/missing-fields"
          />
          <ActionCard
            icon={Bug}
            color="#ef4444"
            title="Bug Tracker"
            description="See every document with an issue logged against it, across all companies, and triage bug status."
            href="/bug-tracker"
          />
        </section>

        {/* ── Recent activity ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            margin: "0 0 16px",
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
            }}
          >
            Recent Activity
          </span>
          <div style={{ flex: 1, height: 1, background: "var(--panel-border)" }} />
          <button
            onClick={() => router.push("/dexai")}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--accent)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            View all
            <ArrowRight size={12} />
          </button>
        </div>

        <section
          style={{
            background: "var(--panel-bg)",
            border: "1px solid var(--panel-border)",
            borderRadius: 14,
            boxShadow: "var(--shadow-sm)",
            overflow: "hidden",
            marginBottom: 36,
          }}
        >
          {/* header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "minmax(200px, 1.4fr) minmax(160px, 1fr) minmax(140px, 0.8fr) 110px 110px 36px",
              gap: 16,
              padding: "11px 20px",
              background: "var(--input-bg)",
              borderBottom: "1px solid var(--panel-border)",
            }}
          >
            {["Request ID", "User", "Document Type", "Status", "Duration", ""].map(
              (h, i) => (
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
              )
            )}
          </div>

          {isLoading ? (
            <div
              style={{
                padding: 40,
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              Loading recent activity...
            </div>
          ) : recent.length === 0 ? (
            <div
              style={{
                padding: 40,
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              No recent activity
            </div>
          ) : (
            recent.map((r, i) => (
              <button
                key={r.request_id}
                onClick={() =>
                  router.push(
                    `/dexai/result/${encodeURIComponent(r.request_id)}`
                  )
                }
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(200px, 1.4fr) minmax(160px, 1fr) minmax(140px, 0.8fr) 110px 110px 36px",
                  gap: 16,
                  alignItems: "center",
                  padding: "13px 20px",
                  borderBottom:
                    i < recent.length - 1 ? "1px solid var(--panel-border)" : "none",
                  background: "transparent",
                  border: "none",
                  borderTop: "none",
                  borderLeft: "none",
                  borderRight: "none",
                  width: "100%",
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "background 0.12s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--input-bg)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
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
                  title={r.request_id}
                >
                  {r.request_id}
                </span>
                <span
                  style={{
                    fontSize: 12.5,
                    color: "var(--foreground)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={r.user_email || ""}
                >
                  {fullName(r)}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    padding: "3px 9px",
                    borderRadius: 6,
                    background: "var(--tag-purple-bg)",
                    color: "var(--tag-purple-color)",
                    fontWeight: 500,
                    justifySelf: "start",
                    maxWidth: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.document_type || "—"}
                </span>
                <StatusBadge status={r.status} />
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Clock size={11} />
                  {formatDuration(r.processing_duration_ms)}
                </span>
                <ArrowRight size={14} style={{ color: "var(--text-muted)" }} />
              </button>
            ))
          )}
        </section>

        {/* ── Footer note ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "18px 0 0",
            borderTop: "1px solid var(--panel-border)",
          }}
        >
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: 5,
              background: "var(--brand-gradient)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Layers size={9} color="#fff" />
          </div>
          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
            TechDexAI · Admin Portal · Internal Use Only
            {recent.length > 0 && (
              <>
                {" "}
                · Last activity {formatDate(recent[0]?.submitted_at)}
              </>
            )}
          </span>
        </div>

        {/* Tip for screen reader: Activity icon for accessibility */}
        <Activity size={0} aria-hidden style={{ position: "absolute" }} />
      </main>
    </div>
  );
}
