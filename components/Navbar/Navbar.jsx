"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Database, FileSearch, Home, ShieldCheck, Sun, Moon, AlertCircle } from "lucide-react";
import { useThemeStore } from "@/lib/store";

/* ── Nav link ──────────────────────────────────────────────── */
function NavLink({ href, label, icon: Icon, active }) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 14px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        textDecoration: "none",
        color: active ? "#fff" : "var(--text-muted)",
        background: active
          ? "linear-gradient(135deg, #2563eb 0%, #6366f1 100%)"
          : "transparent",
        border: active ? "none" : "1px solid transparent",
        boxShadow: active ? "0 2px 8px rgba(37,99,235,0.35)" : "none",
        transition: "all 0.15s ease",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.color = "var(--foreground)";
          e.currentTarget.style.background = "var(--input-bg)";
          e.currentTarget.style.border = "1px solid var(--panel-border)";
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.color = "var(--text-muted)";
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.border = "1px solid transparent";
        }
      }}
    >
      <Icon size={13} />
      {label}
    </Link>
  );
}

/* ── Navbar ────────────────────────────────────────────────── */
export default function Navbar() {
  const { isDark, toggleTheme } = useThemeStore();
  const pathname = usePathname();

  return (
    <header
      style={{
        position: "relative",
        zIndex: 20,
        height: 58,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 28px",
        background: "var(--header-bg)",
        borderBottom: "1px solid var(--panel-border)",
        backdropFilter: "blur(12px)",
        boxShadow: "0 1px 0 var(--panel-border), 0 2px 12px rgba(0,0,0,0.05)",
        flexShrink: 0,
      }}
    >
      {/* ── Brand ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: "linear-gradient(135deg, #2563eb 0%, #6366f1 100%)",
            boxShadow: "0 2px 10px rgba(37,99,235,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Database size={15} color="#fff" />
        </div>
        <div>
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              color: "var(--foreground)",
              lineHeight: 1.1,
            }}
          >
            kdext_doc_parser
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
            Admin Portal
          </div>
        </div>
      </div>

      {/* ── Nav links ── */}
      <nav style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <NavLink href="/"               label="Home"            icon={Home}         active={pathname === "/"} />
        <NavLink href="/analyzer"       label="Analyzer"        icon={FileSearch}   active={pathname === "/analyzer"} />
        <NavLink href="/missing-fields" label="Missing Fields"  icon={AlertCircle}  active={pathname === "/missing-fields"} />
      </nav>

      {/* ── Right controls ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Admin badge */}
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            padding: "4px 10px",
            borderRadius: 99,
            display: "flex",
            alignItems: "center",
            gap: 5,
            background: "var(--tag-green-bg)",
            color: "var(--tag-green-color)",
            border: "1px solid var(--tag-green-color)33",
            letterSpacing: "0.05em",
          }}
        >
          <ShieldCheck size={10} />
          ADMIN
        </span>

        {/* Theme toggle */}
        <div
          onClick={toggleTheme}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            borderRadius: 99,
            cursor: "pointer",
            background: "var(--input-bg)",
            border: "1px solid var(--panel-border)",
            userSelect: "none",
          }}
        >
          <Sun size={12} style={{ color: "#f59e0b" }} />
          <div
            style={{
              position: "relative",
              width: 30,
              height: 16,
              borderRadius: 99,
              background: isDark ? "var(--accent)" : "var(--input-border)",
              transition: "background 0.3s",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: 2,
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: "#fff",
                boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                transform: isDark ? "translateX(14px)" : "translateX(0)",
                transition: "transform 0.3s",
              }}
            />
          </div>
          <Moon size={12} style={{ color: "var(--text-muted)" }} />
        </div>
      </div>
    </header>
  );
}

