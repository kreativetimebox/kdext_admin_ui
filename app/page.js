"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import { useThemeStore } from "@/lib/store";
import Navbar from "@/components/Navbar/Navbar";

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

/* ── Home page ────────────────────────────────────────────── */
export default function HomePage() {
  const { initTheme } = useThemeStore();
  const router = useRouter();

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
                  background:
                    "linear-gradient(135deg, #ffffff 30%, #ffd6e1 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                kdext_doc_parser
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
            kdext_doc_parser · Admin Portal · Internal Use Only
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
