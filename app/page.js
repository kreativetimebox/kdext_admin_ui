"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Database,
  FileSearch,
  ShieldCheck,
  Layers,
  ArrowRight,
  Activity,
  Zap,
  Lock,
} from "lucide-react";
import { useThemeStore } from "@/lib/store";
import Navbar from "@/components/Navbar/Navbar";

/* ── Feature card ────────────────────────────────────────── */
function FeatureCard({ icon: Icon, title, description, color, delay = 0 }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered
          ? `linear-gradient(135deg, var(--panel-bg) 0%, ${color}0d 100%)`
          : "var(--panel-bg)",
        border: hovered ? `1px solid ${color}55` : "1px solid var(--panel-border)",
        boxShadow: hovered
          ? `0 8px 32px ${color}22, var(--shadow-sm)`
          : "var(--shadow-sm)",
        borderRadius: 20,
        padding: "28px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        transition: "all 0.25s ease",
        cursor: "default",
        animationDelay: `${delay}ms`,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(135deg, ${color}22 0%, ${color}11 100%)`,
          border: `1px solid ${color}33`,
          transition: "transform 0.2s ease",
          transform: hovered ? "scale(1.08)" : "scale(1)",
        }}
      >
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: "var(--foreground)" }}>
          {title}
        </p>
        <p style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--text-muted)" }}>
          {description}
        </p>
      </div>
    </div>
  );
}

/* ── Stat pill ────────────────────────────────────────────── */
function StatPill({ label, value, icon: Icon, color }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 20px",
        borderRadius: 16,
        background: "var(--panel-bg)",
        border: "1px solid var(--panel-border)",
        boxShadow: "var(--shadow-sm)",
        minWidth: 150,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `${color}18`,
          border: `1px solid ${color}30`,
          flexShrink: 0,
        }}
      >
        <Icon size={16} style={{ color }} />
      </div>
      <div>
        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", lineHeight: 1.2 }}>
          {value}
        </p>
        <p style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 1, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {label}
        </p>
      </div>
    </div>
  );
}

/* ── Home page ────────────────────────────────────────────── */
export default function HomePage() {
  const { initTheme } = useThemeStore();
  const router = useRouter();
  const [ctaHovered, setCtaHovered] = useState(false);

  useEffect(() => { initTheme(); }, [initTheme]);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--background)", position: "relative", overflow: "hidden" }}>

      {/* ── Ambient background blobs ── */}
      <div aria-hidden style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{
          position: "absolute", top: "-10%", left: "15%",
          width: 600, height: 600, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(37,99,235,0.07) 0%, transparent 70%)",
          filter: "blur(40px)",
        }} />
        <div style={{
          position: "absolute", top: "30%", right: "-5%",
          width: 500, height: 500, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)",
          filter: "blur(40px)",
        }} />
        <div style={{
          position: "absolute", bottom: "5%", left: "5%",
          width: 400, height: 400, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(5,150,105,0.05) 0%, transparent 70%)",
          filter: "blur(40px)",
        }} />
      </div>

      {/* ── Header ── */}
      <Navbar />

      {/* ── Hero ── */}
      <section style={{
        position: "relative", zIndex: 1,
        display: "flex", flexDirection: "column", alignItems: "center",
        textAlign: "center", padding: "72px 24px 56px",
        gap: 28,
      }}>
        {/* Glow ring + icon */}
        <div style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          {/* outer glow ring */}
          <div style={{
            position: "absolute",
            width: 110, height: 110, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(37,99,235,0.18) 0%, transparent 70%)",
            filter: "blur(8px)",
          }} />
          {/* icon box */}
          <div style={{
            width: 80, height: 80, borderRadius: 24,
            background: "linear-gradient(135deg, #2563eb 0%, #6366f1 100%)",
            boxShadow: "0 12px 40px rgba(37,99,235,0.45), 0 0 0 1px rgba(99,102,241,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative",
          }}>
            <Database size={34} color="#fff" />
          </div>
        </div>

        {/* Labels + title */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
          <span style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: "0.18em",
            textTransform: "uppercase", padding: "4px 14px", borderRadius: 99,
            background: "linear-gradient(90deg, var(--tag-bg), var(--active-row))",
            color: "var(--tag-color)",
            border: "1px solid var(--active-border)",
          }}>
            Admin Application
          </span>

          <h1 style={{
            fontSize: "clamp(2rem, 5vw, 3.2rem)",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
            margin: 0,
            background: "linear-gradient(135deg, var(--foreground) 30%, #6366f1 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            kdext_doc_parser
          </h1>

          <p style={{
            fontSize: 15, lineHeight: 1.7, maxWidth: 520,
            color: "var(--text-muted)", margin: 0,
          }}>
            Internal admin portal for reviewing, correcting, and managing
            document parsing results from OCR and AWS Textract pipelines.
          </p>
        </div>

        {/* CTA */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <button
            onClick={() => router.push("/analyzer")}
            onMouseEnter={() => setCtaHovered(true)}
            onMouseLeave={() => setCtaHovered(false)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "12px 24px", borderRadius: 14, border: "none",
              fontSize: 14, fontWeight: 600, color: "#fff", cursor: "pointer",
              background: "linear-gradient(135deg, #2563eb 0%, #6366f1 100%)",
              boxShadow: ctaHovered
                ? "0 8px 28px rgba(37,99,235,0.55), 0 0 0 1px rgba(99,102,241,0.4)"
                : "0 4px 16px rgba(37,99,235,0.4)",
              transform: ctaHovered ? "translateY(-1px)" : "translateY(0)",
              transition: "all 0.2s ease",
            }}
          >
            <Zap size={15} />
            Open Manual Analyzer
            <ArrowRight size={14} style={{ transition: "transform 0.2s", transform: ctaHovered ? "translateX(3px)" : "translateX(0)" }} />
          </button>
        </div>
      </section>

      {/* ── Stats row ── */}
      <section style={{
        position: "relative", zIndex: 1,
        display: "flex", justifyContent: "center", flexWrap: "wrap",
        gap: 12, padding: "0 24px 56px",
      }}>
        <StatPill label="OCR Engine"  value="Azure"      icon={Activity}    color="#2563eb" />
        <StatPill label="Extraction"  value="Textract"   icon={Layers}      color="#7c3aed" />
        <StatPill label="Storage"     value="PostgreSQL" icon={Database}    color="#0891b2" />
        <StatPill label="Access"      value="Admin Only" icon={Lock}        color="#059669" />
      </section>

      {/* ── Divider ── */}
      <div style={{
        position: "relative", zIndex: 1,
        maxWidth: 800, margin: "0 auto 48px", width: "100%", padding: "0 24px",
        display: "flex", alignItems: "center", gap: 16,
      }}>
        <div style={{ flex: 1, height: 1, background: "var(--panel-border)" }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
          What's inside
        </span>
        <div style={{ flex: 1, height: 1, background: "var(--panel-border)" }} />
      </div>

      {/* ── Feature cards ── */}
      <section style={{
        position: "relative", zIndex: 1,
        maxWidth: 960, margin: "0 auto", width: "100%",
        padding: "0 24px 80px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 16,
      }}>
        <FeatureCard delay={0}   icon={FileSearch}  color="#2563eb" title="Document Review"     description="Browse all parsed documents from the kdext_doc_parser pipeline and inspect raw OCR and Textract extraction results side-by-side." />
        <FeatureCard delay={60}  icon={Layers}      color="#7c3aed" title="Result Correction"   description="Manually edit and override extracted field values, approve or reject parsed data, and push corrections back to the database." />
        <FeatureCard delay={120} icon={Activity}    color="#059669" title="Pipeline Monitoring" description="Track document processing status, identify parsing failures, and monitor confidence scores across OCR and Textract models." />
        <FeatureCard delay={180} icon={ShieldCheck} color="#d97706" title="Admin Controls"      description="Restricted to authorised admin users only. All actions are logged for audit purposes within the kdext_doc_parser platform." />
        <FeatureCard delay={240} icon={Database}    color="#0891b2" title="Raw Data Access"     description="Access raw JSON payloads from both the OCR engine and AWS Textract directly from the admin interface for debugging." />
        <FeatureCard delay={300} icon={Lock}        color="#e11d48" title="Multi-format Support" description="Handles a variety of document types including invoices, receipts, IDs, and contracts processed by the parser pipeline." />
      </section>

      {/* ── Footer ── */}
      <footer style={{
        position: "relative", zIndex: 1,
        marginTop: "auto", padding: "20px 24px",
        borderTop: "1px solid var(--panel-border)",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      }}>
        <div style={{
          width: 18, height: 18, borderRadius: 5,
          background: "linear-gradient(135deg, #2563eb 0%, #6366f1 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Database size={10} color="#fff" />
        </div>
        <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
          kdext_doc_parser &nbsp;·&nbsp; Admin Portal &nbsp;·&nbsp; Internal Use Only
        </span>
      </footer>
    </div>
  );
}