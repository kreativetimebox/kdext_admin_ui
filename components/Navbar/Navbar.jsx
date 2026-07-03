"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Database, FileSearch, Home, ShieldCheck, Sun, Moon, Users, LogOut, ChevronDown, Activity, Server } from "lucide-react";
import { useThemeStore } from "@/lib/store";
import { useAuth } from "@/lib/useAuth";
import { useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";

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
        background: active ? "var(--accent)" : "transparent",
        border: active ? "1px solid var(--accent)" : "1px solid transparent",
        boxShadow: active ? "var(--shadow-sm)" : "none",
        transition: "all 0.15s ease",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.color = "var(--foreground)";
          e.currentTarget.style.background = "var(--active-row)";
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
  const router = useRouter();
  const { user, loading } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleLogout = async () => {
    try {
      await axios.post("/api/auth/logout");
      toast.success("Logged out successfully");
      router.push("/auth/login");
    } catch (error) {
      toast.error("Error logging out");
    }
  };

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
        backdropFilter: "blur(18px)",
        boxShadow: "0 1px 0 var(--panel-border), 0 14px 36px rgba(20,14,53,0.14)",
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
            background: "var(--brand-gradient)",
            boxShadow: "0 10px 24px rgba(20,14,53,0.22)",
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
              letterSpacing: 0,
              color: "var(--foreground)",
              lineHeight: 1.1,
            }}
          >
            TechDexAI
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
            Admin Portal
          </div>
        </div>
      </div>

      {/* ── Nav links ── */}
      <nav style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <NavLink href="/"               label="Home"            icon={Home}         active={pathname === "/"} />
        <NavLink href="/dexai"          label="Business Audit"   icon={Users}        active={pathname.startsWith("/dexai")} />
        <NavLink href="/missing-fields" label="HITL EDIT"       icon={ShieldCheck}  active={pathname === "/missing-fields"} />
        {/* User Logs tab - visible only to super users */}
        {!loading && user && user.roles?.includes("SUPER_ADMIN") && (
          <NavLink href="/user-logs"      label="User Logs"       icon={Activity}     active={pathname === "/user-logs"} />
        )}
        {/* Server Monitoring tab - visible only to super users */}
        {!loading && user && user.roles?.includes("SUPER_ADMIN") && (
          <NavLink href="/server-monitor" label="Servers"         icon={Server}       active={pathname === "/server-monitor"} />
        )}
      </nav>

      {/* ── Right controls ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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

        {/* User menu */}
        {!loading && user && (
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                borderRadius: 99,
                cursor: "pointer",
                background: "var(--input-bg)",
                border: "1px solid var(--panel-border)",
                fontSize: 12,
                color: "var(--foreground)",
                fontWeight: 500,
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--accent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--panel-border)";
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: "var(--brand-gradient)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#fff",
                }}
              >
                {user.email.charAt(0).toUpperCase()}
              </div>
              <ChevronDown size={12} />
            </button>

            {/* Dropdown menu */}
            {showUserMenu && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  background: "var(--menu-bg)",
                  border: "1px solid var(--panel-border)",
                  borderRadius: 10,
                  boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
                  minWidth: 200,
                  zIndex: 1000,
                }}
              >
                {/* User info */}
                <div
                  style={{
                    padding: "12px 14px",
                    borderBottom: "1px solid var(--panel-border)",
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--foreground)",
                    }}
                  >
                    {user.email}
                  </p>
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: 11,
                      color: "var(--text-muted)",
                    }}
                  >
                    {user.roles.join(", ")}
                  </p>
                </div>

                {/* Logout button */}
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    handleLogout();
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    background: "transparent",
                    border: "none",
                    borderRadius: 0,
                    fontSize: 13,
                    color: "#dc2626",
                    fontWeight: 500,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--input-bg)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <LogOut size={14} />
                  Logout
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

