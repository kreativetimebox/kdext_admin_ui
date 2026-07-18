"use client";

import { useEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import toast from "react-hot-toast";
import { Search, ChevronUp, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import Navbar from "@/components/Navbar/Navbar";

export const dynamic = "force-dynamic";

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

const SEARCH_DEBOUNCE_MS = 350;

export default function UserLogsPage() {
  const { user, loading: authLoading } = useAuth();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState("last_login_at");
  const [sortOrder, setSortOrder] = useState("DESC");
  const searchInputRef = useRef(null);

  // Check if user is super user
  const isSuperUser = user && user.roles?.includes("SUPER_ADMIN");

  // Keep the input feeling instant while the network request trails behind —
  // otherwise every keystroke fires a brand-new request.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ["user-logs", debouncedSearch, sortBy, sortOrder],
    queryFn: async () => {
      const res = await axios.get("/api/user-logs", {
        params: { search: debouncedSearch, sortBy, sortOrder },
      });
      return res.data.users || [];
    },
    enabled: isSuperUser === true && authLoading === false,
  });

  const handleSearch = (e) => {
    setSearch(e.target.value);
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "ASC" ? "DESC" : "ASC");
    } else {
      setSortBy(column);
      setSortOrder("DESC");
    }
  };

  // Redirect if not super user
  useEffect(() => {
    if (!authLoading && !isSuperUser) {
      toast.error("Access denied. Super user privileges required.");
      window.location.href = "/";
    }
  }, [authLoading, isSuperUser]);

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

  if (!isSuperUser) {
    return null;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-primary)" }}>
      <Navbar />

      <main style={{ flex: 1, padding: "24px 28px" }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--foreground)", margin: 0, marginBottom: 8 }}>
            User Logs
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
            Track user access to the HITL portal
          </p>
        </div>

        {/* Search bar */}
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              background: "var(--input-bg)",
              border: "1px solid var(--panel-border)",
              borderRadius: 8,
              maxWidth: 400,
            }}
          >
            <Search size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={handleSearch}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                fontSize: 14,
                color: "var(--foreground)",
                outline: "none",
              }}
            />
          </div>
        </div>

        {/* Table */}
        <div
          style={{
            borderRadius: 10,
            border: "1px solid var(--panel-border)",
            overflow: "hidden",
            background: "var(--card-bg)",
            boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
          }}
        >
          {isLoading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
              Loading users...
            </div>
          ) : error ? (
            <div style={{ padding: 40, textAlign: "center", color: "#dc2626" }}>
              Error loading user logs
            </div>
          ) : users.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
              No users found
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--panel-border)", background: "var(--input-bg)" }}>
                  <SortableHeader label="Name" column="first_name" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Email" column="email" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Company" column="company_name" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Created" column="created_at" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Last Updated" column="updated_at" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <SortableHeader label="Last Login" column="last_login_at" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                  <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
                    Requests
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user, idx) => (
                  <tr
                    key={user.user_id}
                    style={{
                      borderBottom: idx < users.length - 1 ? "1px solid var(--panel-border)" : "none",
                      background: idx % 2 === 0 ? "transparent" : "var(--input-bg)",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--active-row)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = idx % 2 === 0 ? "transparent" : "var(--input-bg)";
                    }}
                  >
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--foreground)", fontWeight: 500 }}>
                      {fullName(user)}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)" }}>
                      {user.email}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)" }}>
                      {user.company_name || "—"}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)" }}>
                      {formatDate(user.created_at)}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)" }}>
                      {formatDate(user.updated_at)}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)" }}>
                      {formatDate(user.last_login_at)}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)", textAlign: "right" }}>
                      {user.total_requests}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}

function SortableHeader({ label, column, sortBy, sortOrder, onSort }) {
  const isActive = sortBy === column;
  return (
    <th
      onClick={() => onSort(column)}
      style={{
        padding: "12px 16px",
        textAlign: "left",
        fontSize: 12,
        fontWeight: 600,
        color: isActive ? "var(--accent)" : "var(--text-muted)",
        cursor: "pointer",
        userSelect: "none",
        transition: "color 0.15s",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.color = "var(--foreground)";
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.color = "var(--text-muted)";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {label}
        {isActive && (
          sortOrder === "ASC" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
        )}
      </div>
    </th>
  );
}
