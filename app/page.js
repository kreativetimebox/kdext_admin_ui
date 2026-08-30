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
  PieChart,
  BarChart3,
  LayoutGrid,
  Table,
  ScrollText,
} from "lucide-react";
import { useThemeStore } from "@/lib/store";
import { useAuth } from "@/lib/useAuth";
import { canViewRequestLogs } from "@/lib/requestLogsAccess";
import RequestLogsModal from "@/components/Logs/RequestLogsModal";
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

/* ── Bug tracker stats & graphs ────────────────────────────── */
const BUG_STATS_GRID = "1.4fr 0.8fr 0.8fr";
const DOC_TYPE_STATS_GRID = "1.5fr 0.6fr 0.7fr 0.6fr 0.8fr 0.9fr 0.8fr 0.8fr 0.6fr";

function getDonutSlices(items, total, cx = 110, cy = 110, rOuter = 92, rInner = 60) {
  if (total <= 0) return [];
  const nonZero = items.filter((it) => it.value > 0);
  if (nonZero.length === 1) {
    const it = nonZero[0];
    return [
      {
        ...it,
        path: `M ${cx} ${cy - rOuter} A ${rOuter} ${rOuter} 0 1 1 ${cx - 0.001} ${cy - rOuter} L ${cx - 0.001} ${cy - rInner} A ${rInner} ${rInner} 0 1 0 ${cx} ${cy - rInner} Z`,
        pct: "100%",
      },
    ];
  }

  let currentAngle = -Math.PI / 2;
  return nonZero.map((it) => {
    const fraction = it.value / total;
    const angleDelta = fraction * 2 * Math.PI;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angleDelta;
    currentAngle = endAngle;

    const x1 = cx + rOuter * Math.cos(startAngle);
    const y1 = cy + rOuter * Math.sin(startAngle);
    const x2 = cx + rOuter * Math.cos(endAngle);
    const y2 = cy + rOuter * Math.sin(endAngle);

    const x3 = cx + rInner * Math.cos(endAngle);
    const y3 = cy + rInner * Math.sin(endAngle);
    const x4 = cx + rInner * Math.cos(startAngle);
    const y4 = cy + rInner * Math.sin(startAngle);

    const largeArc = angleDelta > Math.PI ? 1 : 0;
    const path = `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4} ${y4} Z`;

    return {
      ...it,
      path,
      pct: `${Math.round(fraction * 100)}%`,
    };
  });
}

function StatusPieChart({ totalsRows, totalIssues, isLoading }) {
  const [hoveredSlice, setHoveredSlice] = useState(null);

  const cx = 110;
  const cy = 110;
  const rOuter = 92;
  const rInner = 60;

  const slices = useMemo(
    () => getDonutSlices(totalsRows, totalIssues, cx, cy, rOuter, rInner),
    [totalsRows, totalIssues]
  );

  const activeItem = hoveredSlice || null;

  return (
    <div
      style={{
        background: "var(--panel-bg)",
        border: "1px solid var(--panel-border)",
        borderRadius: 14,
        padding: "20px 22px",
        boxShadow: "var(--shadow-sm)",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <PieChart size={16} style={{ color: "var(--accent)" }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>
            Status Breakdown
          </span>
        </div>
        <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
          {formatNumber(totalIssues)} total
        </span>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
          Loading chart...
        </div>
      ) : totalIssues === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
          No issue data
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-around",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          {/* SVG Donut */}
          <div style={{ position: "relative", width: 220, height: 220, flexShrink: 0 }}>
            <svg width={220} height={220} viewBox="0 0 220 220">
              {slices.map((slice) => {
                const isHovered = hoveredSlice?.label === slice.label;
                return (
                  <path
                    key={slice.label}
                    d={slice.path}
                    fill={slice.color}
                    stroke="var(--panel-bg)"
                    strokeWidth={2}
                    style={{
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      opacity: hoveredSlice && !isHovered ? 0.45 : 1,
                      transformOrigin: `${cx}px ${cy}px`,
                      transform: isHovered ? "scale(1.04)" : "scale(1)",
                    }}
                    onMouseEnter={() => setHoveredSlice(slice)}
                    onMouseLeave={() => setHoveredSlice(null)}
                  />
                );
              })}
            </svg>

            {/* Donut Center readout */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: 220,
                height: 220,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
                textAlign: "center",
                padding: 10,
              }}
            >
              {activeItem ? (
                <>
                  <span
                    style={{
                      fontSize: 20,
                      fontWeight: 800,
                      color: activeItem.color || "var(--foreground)",
                      lineHeight: 1.1,
                    }}
                  >
                    {formatNumber(activeItem.value)}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--foreground)" }}>
                    {activeItem.pct}
                  </span>
                  <span
                    style={{
                      fontSize: 10.5,
                      color: "var(--text-muted)",
                      maxWidth: 90,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {activeItem.label}
                  </span>
                </>
              ) : (
                <>
                  <span
                    style={{
                      fontSize: 22,
                      fontWeight: 800,
                      color: "var(--foreground)",
                      lineHeight: 1.1,
                    }}
                  >
                    {formatNumber(totalIssues)}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
                    Issues
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Legend */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              flex: "1 1 180px",
              minWidth: 160,
            }}
          >
            {totalsRows.map((r) => {
              const isHovered = hoveredSlice?.label === r.label;
              const fraction = totalIssues > 0 ? r.value / totalIssues : 0;
              const pctStr = totalIssues > 0 ? `${Math.round(fraction * 100)}%` : "0%";
              return (
                <div
                  key={r.label}
                  onMouseEnter={() => setHoveredSlice({ ...r, pct: pctStr })}
                  onMouseLeave={() => setHoveredSlice(null)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "4px 8px",
                    borderRadius: 6,
                    cursor: "pointer",
                    background: isHovered ? "var(--input-bg)" : "transparent",
                    transition: "background 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: r.color,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: isHovered ? 700 : 500,
                        color: "var(--foreground)",
                      }}
                    >
                      {r.label}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)" }}>
                      {formatNumber(r.value)}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", width: 32, textAlign: "right" }}>
                      {pctStr}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function DocTypeBarGraph({ byDocType, isLoading }) {
  const [hoveredBar, setHoveredBar] = useState(null);

  const series = [
    { key: "open", label: "Open", color: "#ef4444" },
    { key: "toBeTested", label: "To Test", color: "#f97316" },
    { key: "closed", label: "Closed", color: "#22c55e" },
    { key: "enhancement", label: "Enhance", color: "#3b82f6" },
    { key: "modelTuning", label: "Model Tune", color: "#a855f7" },
    { key: "invalidDoc", label: "Invalid", color: "#94a3b8" },
    { key: "techIssue", label: "Tech Issue", color: "#eab308" },
  ];

  const items = useMemo(() => {
    return (byDocType || []).map((d) => {
      const total =
        (d.open || 0) +
        (d.toBeTested || 0) +
        (d.closed || 0) +
        (d.enhancement || 0) +
        (d.modelTuning || 0) +
        (d.invalidDoc || 0) +
        (d.techIssue || 0);
      return { ...d, total };
    });
  }, [byDocType]);

  const rawMax = Math.max(1, ...items.map((d) => d.total));
  const niceMax =
    rawMax <= 5
      ? 5
      : rawMax <= 10
      ? 10
      : rawMax <= 25
      ? 25
      : rawMax <= 50
      ? 50
      : Math.ceil(rawMax / 20) * 20;

  const svgWidth = 600;
  const svgHeight = 220;
  const paddingLeft = 40;
  const paddingRight = 16;
  const paddingTop = 20;
  const paddingBottom = 40;
  const plotWidth = svgWidth - paddingLeft - paddingRight;
  const plotHeight = svgHeight - paddingTop - paddingBottom;

  const numBars = items.length;
  const slotWidth = plotWidth / Math.max(1, numBars);
  const barWidth = Math.min(36, Math.max(16, slotWidth * 0.55));

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * niceMax));

  return (
    <div
      style={{
        background: "var(--panel-bg)",
        border: "1px solid var(--panel-border)",
        borderRadius: 14,
        padding: "20px 22px",
        boxShadow: "var(--shadow-sm)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <BarChart3 size={16} style={{ color: "var(--accent)" }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>
            Issues by Type
          </span>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {series.map((s) => (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.color }} />
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
          Loading graph...
        </div>
      ) : items.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
          No tracked issues to display
        </div>
      ) : (
        <div style={{ width: "100%", overflowX: "auto", position: "relative" }}>
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{ width: "100%", minWidth: 460, height: "auto", display: "block" }}
          >
            {/* Gridlines & Y-Axis Ticks */}
            {yTicks.map((val) => {
              const y = paddingTop + plotHeight - (val / niceMax) * plotHeight;
              return (
                <g key={val}>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={svgWidth - paddingRight}
                    y2={y}
                    stroke="var(--panel-border)"
                    strokeDasharray={val === 0 ? undefined : "3 3"}
                    strokeWidth={val === 0 ? 1.5 : 1}
                  />
                  <text
                    x={paddingLeft - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    fontSize={10}
                    fill="var(--text-muted)"
                    fontFamily="inherit"
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            {/* Bars */}
            {items.map((item, idx) => {
              const xCenter = paddingLeft + idx * slotWidth + slotWidth / 2;
              const barX = xCenter - barWidth / 2;
              let currentY = paddingTop + plotHeight;
              const isHovered = hoveredBar?.document_type === item.document_type;

              // Segments stacked from bottom
              const renderedSegments = [];
              series.forEach((s) => {
                const count = item[s.key] || 0;
                if (count <= 0) return;
                const segHeight = (count / niceMax) * plotHeight;
                const segY = currentY - segHeight;
                currentY = segY;
                renderedSegments.push({
                  key: s.key,
                  color: s.color,
                  label: s.label,
                  count,
                  y: segY,
                  height: segHeight,
                });
              });

              return (
                <g
                  key={item.document_type || idx}
                  onMouseEnter={() => setHoveredBar(item)}
                  onMouseLeave={() => setHoveredBar(null)}
                  style={{ cursor: "pointer" }}
                >
                  {/* Background hover highlight column */}
                  <rect
                    x={paddingLeft + idx * slotWidth + 2}
                    y={paddingTop}
                    width={slotWidth - 4}
                    height={plotHeight}
                    fill={isHovered ? "var(--input-bg)" : "transparent"}
                    rx={6}
                    opacity={0.6}
                  />

                  {/* Stacked rects */}
                  {renderedSegments.map((seg, sIdx) => {
                    const isTop = sIdx === renderedSegments.length - 1;
                    return (
                      <rect
                        key={seg.key}
                        x={barX}
                        y={seg.y}
                        width={barWidth}
                        height={seg.height}
                        fill={seg.color}
                        rx={isTop ? 3 : 0}
                        opacity={isHovered ? 1 : 0.9}
                      />
                    );
                  })}

                  {/* Total on top of bar */}
                  {item.total > 0 && (
                    <text
                      x={xCenter}
                      y={currentY - 5}
                      textAnchor="middle"
                      fontSize={10.5}
                      fontWeight={700}
                      fill={isHovered ? "var(--foreground)" : "var(--text-muted)"}
                    >
                      {item.total}
                    </text>
                  )}

                  {/* X-axis Label */}
                  <text
                    x={xCenter}
                    y={paddingTop + plotHeight + 16}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={isHovered ? 700 : 500}
                    fill={isHovered ? "var(--foreground)" : "var(--text-muted)"}
                  >
                    {item.document_type?.length > 12
                      ? `${item.document_type.slice(0, 10)}…`
                      : item.document_type || "—"}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Hover Tooltip */}
          {hoveredBar && (
            <div
              style={{
                position: "absolute",
                top: 8,
                right: 12,
                background: "var(--panel-bg)",
                border: "1px solid var(--panel-border)",
                borderRadius: 8,
                padding: "8px 12px",
                boxShadow: "var(--shadow-md)",
                fontSize: 12,
                pointerEvents: "none",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                zIndex: 10,
              }}
            >
              <span style={{ fontWeight: 700, color: "var(--foreground)" }}>
                {hoveredBar.document_type} ({hoveredBar.total} total)
              </span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11 }}>
                {series.map(
                  (s) =>
                    hoveredBar[s.key] > 0 && (
                      <span key={s.key} style={{ color: s.color, fontWeight: 600 }}>
                        {s.label}: {hoveredBar[s.key]}
                      </span>
                    )
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BugStatsSection({ clientIds, onClientIdsChange, clientOptions, isClientRole }) {
  const [viewMode, setViewMode] = useState("combined"); // "combined" | "charts" | "tables"
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

  const totals = data?.totals || { open: 0, toBeTested: 0, closed: 0, enhancement: 0, modelTuning: 0, invalidDoc: 0, techIssue: 0 };
  const byDocType = data?.byDocType || [];
  const totalIssues =
    (totals.open || 0) +
    (totals.toBeTested || 0) +
    (totals.closed || 0) +
    (totals.enhancement || 0) +
    (totals.modelTuning || 0) +
    (totals.invalidDoc || 0) +
    (totals.techIssue || 0);
  const pct = (n) => (totalIssues > 0 ? `${Math.round((n / totalIssues) * 100)}%` : "—");

  const totalsRows = [
    { label: "Open", value: totals.open || 0, color: "#ef4444" },
    { label: "To Be Tested", value: totals.toBeTested || 0, color: "#f97316" },
    { label: "Closed", value: totals.closed || 0, color: "#22c55e" },
    { label: "Enhancement", value: totals.enhancement || 0, color: "#3b82f6" },
    { label: "Model Tuning", value: totals.modelTuning || 0, color: "#a855f7" },
    { label: "Invalid doc", value: totals.invalidDoc || 0, color: "#94a3b8" },
    { label: "Tech Issue", value: totals.techIssue || 0, color: "#eab308" },
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

        {/* View Switcher Controls */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: 3,
            borderRadius: 8,
            background: "var(--input-bg)",
            border: "1px solid var(--panel-border)",
            gap: 2,
          }}
        >
          <button
            type="button"
            onClick={() => setViewMode("combined")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 11.5,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              background: viewMode === "combined" ? "var(--panel-bg)" : "transparent",
              color: viewMode === "combined" ? "var(--foreground)" : "var(--text-muted)",
              boxShadow: viewMode === "combined" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            <LayoutGrid size={12} />
            Both
          </button>
          <button
            type="button"
            onClick={() => setViewMode("charts")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 11.5,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              background: viewMode === "charts" ? "var(--panel-bg)" : "transparent",
              color: viewMode === "charts" ? "var(--foreground)" : "var(--text-muted)",
              boxShadow: viewMode === "charts" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            <PieChart size={12} />
            Charts
          </button>
          <button
            type="button"
            onClick={() => setViewMode("tables")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 11.5,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              background: viewMode === "tables" ? "var(--panel-bg)" : "transparent",
              color: viewMode === "tables" ? "var(--foreground)" : "var(--text-muted)",
              boxShadow: viewMode === "tables" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            <Table size={12} />
            Tables
          </button>
        </div>

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

      {/* Graphical Charts Section */}
      {(viewMode === "combined" || viewMode === "charts") && (
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(300px, 1fr) minmax(360px, 1.4fr)",
            gap: 16,
            marginBottom: viewMode === "combined" ? 16 : 36,
          }}
        >
          <StatusPieChart totalsRows={totalsRows} totalIssues={totalIssues} isLoading={isLoading} />
          <DocTypeBarGraph byDocType={byDocType} isLoading={isLoading} />
        </section>
      )}

      {/* Tables Section */}
      {(viewMode === "combined" || viewMode === "tables") && (
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

          {/* By type table */}
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
              <div style={{ minWidth: 700 }}>
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
                  {["Type", "Open", "To Test", "Closed", "Enhance", "Model Tune", "Invalid Doc", "Tech Issue", "Total"].map((h) => (
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
                      <span style={{ fontSize: 13, color: "#f97316" }}>{formatNumber(r.toBeTested)}</span>
                      <span style={{ fontSize: 13, color: "#22c55e" }}>{formatNumber(r.closed)}</span>
                      <span style={{ fontSize: 13, color: "#3b82f6" }}>{formatNumber(r.enhancement)}</span>
                      <span style={{ fontSize: 13, color: "#a855f7" }}>{formatNumber(r.modelTuning)}</span>
                      <span style={{ fontSize: 13, color: "#94a3b8" }}>{formatNumber(r.invalidDoc)}</span>
                      <span style={{ fontSize: 13, color: "#eab308" }}>{formatNumber(r.techIssue)}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>
                        {formatNumber(
                          (r.open || 0) +
                          (r.toBeTested || 0) +
                          (r.closed || 0) +
                          (r.enhancement || 0) +
                          (r.modelTuning || 0) +
                          (r.invalidDoc || 0) +
                          (r.techIssue || 0)
                        )}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

/* ── Home page ────────────────────────────────────────────── */
export default function HomePage() {
  const { initTheme } = useThemeStore();
  const router = useRouter();
  const { user } = useAuth();
  const showLogsOption = canViewRequestLogs(user);
  const [activeLogRecord, setActiveLogRecord] = useState(null);
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
              gridTemplateColumns: showLogsOption
                ? "minmax(200px, 1.4fr) minmax(160px, 1fr) minmax(140px, 0.8fr) 110px 110px 40px 36px"
                : "minmax(200px, 1.4fr) minmax(160px, 1fr) minmax(140px, 0.8fr) 110px 110px 36px",
              gap: 16,
              padding: "11px 20px",
              background: "var(--input-bg)",
              borderBottom: "1px solid var(--panel-border)",
            }}
          >
            {["Request ID", "User", "Type", "Status", "Duration", ...(showLogsOption ? ["Logs"] : []), ""].map(
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
                  gridTemplateColumns: showLogsOption
                    ? "minmax(200px, 1.4fr) minmax(160px, 1fr) minmax(140px, 0.8fr) 110px 110px 40px 36px"
                    : "minmax(200px, 1.4fr) minmax(160px, 1fr) minmax(140px, 0.8fr) 110px 110px 36px",
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
                {showLogsOption && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveLogRecord(r);
                    }}
                    title="View Request Logs"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 30,
                      height: 30,
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
                  </span>
                )}
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

      {showLogsOption && (
        <RequestLogsModal
          requestId={activeLogRecord?.request_id}
          isOpen={!!activeLogRecord}
          onClose={() => setActiveLogRecord(null)}
          initialFilename={activeLogRecord?.document_path || activeLogRecord?.request_id}
        />
      )}
    </div>
  );
}
