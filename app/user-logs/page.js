"use client";

import { useEffect, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import toast from "react-hot-toast";
import { Search, ChevronUp, ChevronDown, Plus, UserX, UserCheck, X, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import Navbar from "@/components/Navbar/Navbar";
import { TEAM_ROLES } from "@/lib/constants";

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

const TABS = [
  { key: "team", label: "Team Members" },
  { key: "clients", label: "Clients" },
];

export default function UserLogsPage() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState("team");

  const isSuperUser = user && user.roles?.includes("SUPER_ADMIN");

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
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--foreground)", margin: 0, marginBottom: 8 }}>
            User Logs
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
            Manage internal team accounts and view client activity
          </p>
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--panel-border)" }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                padding: "10px 18px",
                fontSize: 14,
                fontWeight: 600,
                border: "none",
                borderBottom: tab === t.key ? "2px solid var(--accent)" : "2px solid transparent",
                background: "transparent",
                color: tab === t.key ? "var(--accent)" : "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "team" ? <TeamMembersTab currentUserId={user?.id} /> : <ClientsTab />}
      </main>
    </div>
  );
}

function SortableHeader({ label, column, sortBy, sortOrder, onSort, align }) {
  const isActive = sortBy === column;
  return (
    <th
      onClick={() => onSort(column)}
      style={{
        padding: "12px 16px",
        textAlign: align || "left",
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
      <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
        {label}
        {isActive && (sortOrder === "ASC" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
      </div>
    </th>
  );
}

function SearchBar({ value, onChange, placeholder }) {
  return (
    <div style={{ marginBottom: 20 }}>
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
          type="text"
          name="table-search"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
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
  );
}

function RoleBadges({ roles }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {(roles || []).map((r) => (
        <span
          key={r}
          style={{
            padding: "2px 8px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            background: "var(--input-bg)",
            border: "1px solid var(--panel-border)",
            color: "var(--foreground)",
          }}
        >
          {r}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team Members tab
// ---------------------------------------------------------------------------

function TeamMembersTab({ currentUserId }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState("first_name");
  const [sortOrder, setSortOrder] = useState("ASC");
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const { data: members = [], isLoading, error } = useQuery({
    queryKey: ["team-members", debouncedSearch, sortBy, sortOrder],
    queryFn: async () => {
      const res = await axios.get("/api/team-members", {
        params: { search: debouncedSearch, sortBy, sortOrder },
      });
      return res.data.members || [];
    },
  });

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "ASC" ? "DESC" : "ASC");
    } else {
      setSortBy(column);
      setSortOrder("ASC");
    }
  };

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["team-members"] });
  }

  async function handleDeactivate(member) {
    if (!window.confirm(`Deactivate ${member.email}? They will no longer be able to log in.`)) return;
    try {
      await axios.delete(`/api/team-members/${member.internal_user_id}`);
      toast.success("Team member deactivated");
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to deactivate team member");
    }
  }

  async function handleActivate(member) {
    try {
      await axios.patch(`/api/team-members/${member.internal_user_id}`, { isActive: true });
      toast.success("Team member activated");
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to activate team member");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search by name or email..." />
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "9px 16px",
            borderRadius: 8,
            border: "none",
            background: "var(--accent)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            marginBottom: 20,
            height: "fit-content",
          }}
        >
          <Plus size={15} /> Add Team Member
        </button>
      </div>

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
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading team members...</div>
        ) : error ? (
          <div style={{ padding: 40, textAlign: "center", color: "#dc2626" }}>Error loading team members</div>
        ) : members.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>No team members found</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--panel-border)", background: "var(--input-bg)" }}>
                <SortableHeader label="Name" column="first_name" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Email" column="email" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Roles</th>
                <SortableHeader label="Status" column="is_active" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Created" column="created_at" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Last Login" column="last_login_at" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Activate/Deactivate</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m, idx) => {
                const isSelf = String(m.internal_user_id) === String(currentUserId);
                return (
                  <tr
                    key={m.internal_user_id}
                    style={{
                      borderBottom: idx < members.length - 1 ? "1px solid var(--panel-border)" : "none",
                      background: idx % 2 === 0 ? "transparent" : "var(--input-bg)",
                      opacity: m.is_active ? 1 : 0.55,
                    }}
                  >
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--foreground)", fontWeight: 500 }}>
                      {fullName(m)} {isSelf && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>(you)</span>}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)" }}>{m.email}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <RoleBadges roles={m.roles} />
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 12 }}>
                      <span
                        style={{
                          padding: "3px 9px",
                          borderRadius: 999,
                          fontWeight: 600,
                          background: m.is_active ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                          color: m.is_active ? "#16a34a" : "#ef4444",
                        }}
                      >
                        {m.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)" }}>{formatDate(m.created_at)}</td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)" }}>{formatDate(m.last_login_at)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 8 }}>
                        {m.is_active ? (
                          <button
                            type="button"
                            title={isSelf ? "You cannot deactivate your own account" : "Deactivate"}
                            disabled={isSelf}
                            onClick={() => handleDeactivate(m)}
                            style={iconBtnStyle(isSelf, "#ef4444")}
                          >
                            <UserX size={14} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            title="Activate"
                            onClick={() => handleActivate(m)}
                            style={iconBtnStyle(false, "#16a34a")}
                          >
                            <UserCheck size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showAddModal && (
        <AddTeamMemberModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => {
            setShowAddModal(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function iconBtnStyle(disabled, color) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: 6,
    border: "1px solid var(--panel-border)",
    background: "var(--input-bg)",
    color: disabled ? "var(--text-muted)" : color || "var(--foreground)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}

function AddTeamMemberModal({ onClose, onSaved }) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [roles, setRoles] = useState(new Set());
  const [saving, setSaving] = useState(false);

  function toggleRole(role) {
    setRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }

  async function handleSave() {
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }
    if (!password || password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (roles.size === 0) {
      toast.error("At least one role is required");
      return;
    }

    setSaving(true);
    try {
      await axios.post("/api/team-members", {
        email: email.trim(),
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        password,
        roles: Array.from(roles),
      });
      toast.success("Team member created");
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to create team member");
    } finally {
      setSaving(false);
    }
  }

  // Hardcoded (not theme `var(--...)`) colors here on purpose: this modal must
  // stay a solid white card in both light and dark mode, so its text colors
  // are pinned to dark grays that stay readable against that fixed background.
  const fieldStyle = {
    fontSize: 13,
    padding: "9px 11px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "#ffffff",
    color: "#111827",
    width: "100%",
  };
  const labelStyle = { fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "block" };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440,
          maxWidth: "90vw",
          maxHeight: "85vh",
          overflowY: "auto",
          background: "#ffffff",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
          padding: 22,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#111827" }}>
            Add Team Member
          </h2>
          <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#6b7280" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>First Name</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="off"
                name="member-first-name"
                style={fieldStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Last Name</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="off"
                name="member-last-name"
                style={fieldStyle}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              name="member-email"
              style={fieldStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Password</label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                name="member-password"
                style={{ ...fieldStyle, paddingRight: 36 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                title={showPassword ? "Hide password" : "Show password"}
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "#6b7280",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Roles</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {TEAM_ROLES.map((role) => (
                <label
                  key={role}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 13,
                    color: "#111827",
                    cursor: "pointer",
                  }}
                >
                  <input type="checkbox" checked={roles.has(role)} onChange={() => toggleRole(role)} />
                  {role}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 22 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "1px solid #d1d5db", background: "#f3f4f6", color: "#111827", cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clients tab
// ---------------------------------------------------------------------------

function ClientsTab() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState("last_login_at");
  const [sortOrder, setSortOrder] = useState("DESC");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ["clients", debouncedSearch, sortBy, sortOrder],
    queryFn: async () => {
      const res = await axios.get("/api/user-logs", {
        params: { search: debouncedSearch, sortBy, sortOrder },
      });
      return res.data.users || [];
    },
  });

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "ASC" ? "DESC" : "ASC");
    } else {
      setSortBy(column);
      setSortOrder("DESC");
    }
  };

  return (
    <div>
      <SearchBar value={search} onChange={setSearch} placeholder="Search by name, email, or company..." />

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
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading clients...</div>
        ) : error ? (
          <div style={{ padding: 40, textAlign: "center", color: "#dc2626" }}>Error loading clients</div>
        ) : users.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>No clients found</div>
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
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Requests</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, idx) => (
                <tr
                  key={u.user_id}
                  style={{
                    borderBottom: idx < users.length - 1 ? "1px solid var(--panel-border)" : "none",
                    background: idx % 2 === 0 ? "transparent" : "var(--input-bg)",
                  }}
                >
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--foreground)", fontWeight: 500 }}>{fullName(u)}</td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)" }}>{u.email}</td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)" }}>{u.company_name || "—"}</td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)" }}>{formatDate(u.created_at)}</td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)" }}>{formatDate(u.updated_at)}</td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)" }}>{formatDate(u.last_login_at)}</td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)", textAlign: "right" }}>{u.total_requests}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
