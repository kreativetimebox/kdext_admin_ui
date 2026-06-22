"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import toast from "react-hot-toast";
import {
  Search,
  AlertCircle,
  Users,
  ChevronRight,
  X,
  Mail,
  Activity,
  CheckCircle2,
  XCircle,
  UserCircle,
} from "lucide-react";
import { useThemeStore } from "@/lib/store";
import Navbar from "@/components/Navbar/Navbar";

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function fullName(u) {
  const parts = [u?.first_name, u?.last_name].filter(Boolean);
  return parts.length ? parts.join(" ") : "—";
}

function initialsOf(u) {
  const f = (u?.first_name || "").trim();
  const l = (u?.last_name || "").trim();
  if (f || l) return `${f[0] || ""}${l[0] || ""}`.toUpperCase();
  const e = (u?.email || "").trim();
  return (e[0] || "?").toUpperCase();
}

function UserRow({ user, onOpen }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(user.user_id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(user.user_id);
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "grid",
        gridTemplateColumns:
          "minmax(220px, 1.4fr) minmax(220px, 1.2fr) 110px 130px 130px 180px 36px",
        gap: 16,
        alignItems: "center",
        padding: "14px 20px",
        borderBottom: "1px solid var(--panel-border)",
        background: hovered ? "var(--input-bg)" : "transparent",
        cursor: "pointer",
        transition: "background 0.12s ease",
      }}
    >
      {/* name */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "var(--brand-gradient)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {initialsOf(user)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--foreground)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={fullName(user)}
          >
            {fullName(user)}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
            }}
          >
            #{user.user_id}
          </div>
        </div>
      </div>

      {/* email */}
      <div
        style={{
          fontSize: 12,
          color: "var(--foreground)",
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
        title={user.email}
      >
        <Mail size={11} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</span>
      </div>

      {/* total */}
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          padding: "4px 10px",
          borderRadius: 8,
          background: "var(--tag-bg)",
          color: "var(--accent)",
          textAlign: "center",
          justifySelf: "start",
        }}
      >
        {user.total_requests}
      </span>

      {/* completed */}
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--tag-green-color)",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <CheckCircle2 size={12} />
        {user.completed_count}
      </span>

      {/* failed */}
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: user.failed_count > 0 ? "var(--danger-color)" : "var(--text-muted)",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <XCircle size={12} />
        {user.failed_count}
      </span>

      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
        {formatDate(user.last_submitted_at || user.created_at)}
      </span>

      <ChevronRight
        size={16}
        style={{ color: hovered ? "var(--accent)" : "var(--text-muted)" }}
      />
    </div>
  );
}

export default function DexaiUsersPage() {
  const { initTheme } = useThemeStore();
  const router = useRouter();
  const [search, setSearch] = useState("");

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["dexai", "users"],
    queryFn: async () => {
      const res = await axios.get("/api/dexai/users");
      return res.data.users || [];
    },
    staleTime: 2 * 60 * 1000,
    onError: () => toast.error("Failed to load users"),
  });

  const users = data || [];

  const visibleUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.email || "").toLowerCase().includes(q) ||
        (u.first_name || "").toLowerCase().includes(q) ||
        (u.last_name || "").toLowerCase().includes(q) ||
        String(u.user_id).includes(q)
    );
  }, [users, search]);

  const totals = useMemo(() => {
    return users.reduce(
      (acc, u) => {
        acc.total += u.total_requests || 0;
        acc.completed += u.completed_count || 0;
        return acc;
      },
      { total: 0, completed: 0 }
    );
  }, [users]);

  const handleOpen = (userId) => {
    router.push(`/dexai/${encodeURIComponent(userId)}`);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "var(--background)",
      }}
    >
      <Navbar />

      <main
        style={{
          flex: 1,
          padding: "32px 40px",
          maxWidth: 1500,
          margin: "0 auto",
          width: "100%",
        }}
      >
        {/* Page header */}
        <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "var(--brand-gradient)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Users size={20} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <h1
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: "var(--foreground)",
                margin: 0,
              }}
            >
              Clients
            </h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
              Users from{" "}
              <span style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>
                MAIN_FINANCE_DB
              </span>
              . Click any row to view that client&apos;s document processing results.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "5px 12px",
                borderRadius: 99,
                background: "var(--tag-bg)",
                color: "var(--accent)",
                border: "1px solid var(--panel-border)",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <UserCircle size={12} />
              {visibleUsers.length} of {users.length}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "5px 12px",
                borderRadius: 99,
                background: "var(--tag-green-bg)",
                color: "var(--tag-green-color)",
                border: "1px solid var(--panel-border)",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <Activity size={12} />
              {totals.completed.toLocaleString()} / {totals.total.toLocaleString()} done
            </span>
          </div>
        </div>

        {/* Filters */}
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 24,
            padding: 16,
            background: "var(--panel-bg)",
            border: "1px solid var(--panel-border)",
            borderRadius: 12,
            boxShadow: "var(--shadow-sm)",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ flex: 1, position: "relative", minWidth: 260 }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
            />
            <input
              type="text"
              placeholder="Search by name, email, or user id..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 12px 9px 38px",
                fontSize: 13,
                border: "1px solid var(--input-border)",
                borderRadius: 8,
                background: "var(--input-bg)",
                color: "var(--foreground)",
                outline: "none",
              }}
            />
          </div>
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                border: "1px solid var(--panel-border)",
                background: "var(--input-bg)",
                color: "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              <X size={13} />
              Clear
            </button>
          )}
        </div>

        {/* Table */}
        <div
          style={{
            background: "var(--panel-bg)",
            border: "1px solid var(--panel-border)",
            borderRadius: 12,
            boxShadow: "var(--shadow-sm)",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "minmax(220px, 1.4fr) minmax(220px, 1.2fr) 110px 130px 130px 180px 36px",
              gap: 16,
              padding: "12px 20px",
              background: "var(--input-bg)",
              borderBottom: "1px solid var(--panel-border)",
            }}
          >
            {["Name", "Email", "Total", "Completed", "Failed", "Last Activity"].map(
              (h) => (
                <span
                  key={h}
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
            <span />
          </div>

          {/* Body */}
          <div>
            {isLoading ? (
              <div
                style={{
                  padding: 40,
                  textAlign: "center",
                  color: "var(--text-muted)",
                }}
              >
                Loading users...
              </div>
            ) : error ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--danger-color)" }}>
                <AlertCircle size={32} style={{ marginBottom: 12 }} />
                <p>Failed to load users</p>
              </div>
            ) : visibleUsers.length === 0 ? (
              <div style={{ padding: 60, textAlign: "center" }}>
                <Users
                  size={40}
                  style={{ color: "var(--text-muted)", marginBottom: 12 }}
                />
                <p
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: "var(--foreground)",
                    marginBottom: 4,
                  }}
                >
                  No users found
                </p>
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {search ? "Try adjusting your search" : "No users available"}
                </p>
              </div>
            ) : (
              visibleUsers.map((user) => (
                <UserRow key={user.user_id} user={user} onOpen={handleOpen} />
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
