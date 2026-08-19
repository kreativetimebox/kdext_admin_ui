"use client";

import { useEffect, useState, useRef, useMemo, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import toast from "react-hot-toast";
import { Search, ChevronUp, ChevronDown, ChevronRight, Plus, UserX, UserCheck, X, Eye, EyeOff, Pencil, KeyRound, RefreshCw, Copy, UserPlus, ShieldCheck, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import Navbar from "@/components/Navbar/Navbar";
import { TEAM_ROLES } from "@/lib/constants";
import MultiSelectDropdown from "@/components/Filters/MultiSelectDropdown";

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
  { key: "hitlWorkload", label: "HITL Workload" },
];

export default function UserLogsPage() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState("team");

  const isSuperUser = user && user.roles?.includes("SUPER_ADMIN");
  // CLIENT_ADMIN and the flat CLIENT role both get the sub-user management view.
  const isClientAdmin = user && user.roles?.some((r) => ["CLIENT_ADMIN", "CLIENT"].includes(r));

  useEffect(() => {
    if (!authLoading && !isSuperUser && !isClientAdmin) {
      toast.error("Access denied.");
      window.location.href = "/";
    }
  }, [authLoading, isSuperUser, isClientAdmin]);

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

  if (!isSuperUser && !isClientAdmin) {
    return null;
  }

  // CLIENT_ADMIN gets a lightweight, unrelated view — they can only ever
  // manage their own CLIENT_USER accounts (lib/clientUsers.js), never the
  // full Team Members/Clients/HITL Workload tabs below.
  if (isClientAdmin) {
    return <ClientAdminUserLogsPage />;
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

        {tab === "team" && <TeamMembersTab currentUserId={user?.id} />}
        {tab === "clients" && <ClientsTab />}
        {tab === "hitlWorkload" && <HitlWorkloadTab />}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CLIENT_ADMIN's restricted User Logs view — manage this client's own
// CLIENT_USER accounts only. Backed by /api/client-users, which scopes every
// query to the requester's own client_id server-side (lib/clientUsers.js).
// ---------------------------------------------------------------------------

function ClientAdminUserLogsPage() {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [credentialsUser, setCredentialsUser] = useState(null);
  const [editPageAccessUser, setEditPageAccessUser] = useState(null);

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ["client-users"],
    queryFn: async () => (await axios.get("/api/client-users")).data.users || [],
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["client-users"] });
  }

  async function handleToggleActive(u) {
    try {
      await axios.patch(`/api/client-users/${u.internal_user_id}`, { isActive: !u.is_active });
      toast.success(u.is_active ? "User deactivated" : "User activated");
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to update user");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--bg-primary)" }}>
      <Navbar />

      <main style={{ flex: 1, padding: "24px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--foreground)", margin: 0, marginBottom: 8 }}>
              User Logs
            </h1>
            <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
              Manage the users on your account
            </p>
          </div>
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
              height: "fit-content",
            }}
          >
            <Plus size={15} /> Add User
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
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading users...</div>
          ) : error ? (
            <div style={{ padding: 40, textAlign: "center", color: "#dc2626" }}>Error loading users</div>
          ) : users.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>No users yet — add one to get started</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--panel-border)", background: "var(--input-bg)" }}>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Name</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Email</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Role</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Status</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Last Login</th>
                  <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, idx) => {
                  const isClientAdminRow = u.roles.includes("CLIENT_ADMIN");
                  return (
                    <tr
                      key={u.internal_user_id}
                      style={{
                        borderBottom: idx < users.length - 1 ? "1px solid var(--panel-border)" : "none",
                        background: idx % 2 === 0 ? "transparent" : "var(--input-bg)",
                        opacity: u.is_active ? 1 : 0.55,
                      }}
                    >
                      <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--foreground)", fontWeight: 500 }}>{fullName(u)}</td>
                      <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)" }}>{u.email}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <RoleBadges roles={u.roles} />
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12 }}>
                        <span
                          style={{
                            padding: "3px 9px",
                            borderRadius: 999,
                            fontWeight: 600,
                            background: u.is_active ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                            color: u.is_active ? "#16a34a" : "#ef4444",
                          }}
                        >
                          {u.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)" }}>{formatDate(u.last_login_at)}</td>
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        {!isClientAdminRow && (
                          <div style={{ display: "inline-flex", gap: 8 }}>
                            <button
                              type="button"
                              title="Edit page access"
                              onClick={() => setEditPageAccessUser(u)}
                              style={iconBtnStyle(false)}
                            >
                              <ShieldCheck size={14} />
                            </button>
                            <button
                              type="button"
                              title="View/edit password"
                              onClick={() => setCredentialsUser(u)}
                              style={iconBtnStyle(false)}
                            >
                              <KeyRound size={14} />
                            </button>
                            <button
                              type="button"
                              title={u.is_active ? "Deactivate" : "Activate"}
                              onClick={() => handleToggleActive(u)}
                              style={iconBtnStyle(false, u.is_active ? "#ef4444" : "#16a34a")}
                            >
                              {u.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                            </button>
                            <button
                              type="button"
                              title="Delete user"
                              onClick={async () => {
                                if (!window.confirm(`Are you sure you want to delete user "${u.email}"?`)) return;
                                try {
                                  await axios.delete(`/api/client-users/${u.internal_user_id}`);
                                  toast.success("User deleted");
                                  queryClient.invalidateQueries({ queryKey: ["client-users"] });
                                } catch (err) {
                                  toast.error(err?.response?.data?.error || "Failed to delete user");
                                }
                              }}
                              style={iconBtnStyle(false, "#ef4444")}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {showAddModal && (
        <AddClientUserModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => {
            setShowAddModal(false);
            refresh();
          }}
        />
      )}

      {credentialsUser && (
        <UserCredentialsModal
          title="User Credentials"
          fetchUrl={`/api/client-users/${credentialsUser.internal_user_id}/credentials`}
          saveUrl={`/api/client-users/${credentialsUser.internal_user_id}/credentials`}
          onClose={() => setCredentialsUser(null)}
        />
      )}

      {editPageAccessUser && (
        <EditPageAccessModal
          user={editPageAccessUser}
          onClose={() => setEditPageAccessUser(null)}
          onSaved={() => {
            setEditPageAccessUser(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function AddClientUserModal({ onClose, onSaved }) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }
    if (!password || password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setSaving(true);
    try {
      await axios.post("/api/client-users", {
        email: email.trim(),
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        password,
      });
      toast.success("User created");
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to create user");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 420, maxWidth: "90vw", maxHeight: "85vh", overflowY: "auto", background: "#ffffff", borderRadius: 12, border: "1px solid #e5e7eb", boxShadow: "0 12px 40px rgba(0,0,0,0.25)", padding: 22 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#111827" }}>Add User</h2>
          <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#6b7280" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={modalLabelStyle}>First Name</label>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="off" name="client-user-first-name" style={modalFieldStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={modalLabelStyle}>Last Name</label>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="off" name="client-user-last-name" style={modalFieldStyle} />
            </div>
          </div>

          <div>
            <label style={modalLabelStyle}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" name="client-user-email" style={modalFieldStyle} />
          </div>

          <div>
            <label style={modalLabelStyle}>Password</label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                name="client-user-password"
                style={{ ...modalFieldStyle, paddingRight: 36 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                title={showPassword ? "Hide password" : "Show password"}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: "#6b7280", display: "flex", alignItems: "center" }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 22 }}>
          <button type="button" onClick={onClose} disabled={saving} style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "1px solid #d1d5db", background: "#f3f4f6", color: "#111827", cursor: "pointer" }}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving} style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal for viewing/editing page access permissions for a CLIENT sub-user.
// Used by CLIENT_ADMIN in their own User Logs view.
function EditPageAccessModal({ user, onClose, onSaved }) {
  const currentAccess = user.page_access && typeof user.page_access === "object" ? user.page_access : {};
  const [access, setAccess] = useState({
    dashboard:     currentAccess.dashboard     !== false,
    businessAudit: currentAccess.businessAudit !== false,
    bugTracker:    currentAccess.bugTracker    !== false,
    hitlEdit:      currentAccess.hitlEdit      === true,
  });
  const [saving, setSaving] = useState(false);

  const toggle = (k) => setAccess((p) => ({ ...p, [k]: !p[k] }));

  const PAGE_FLAGS = [
    { key: "dashboard",     label: "Dashboard" },
    { key: "businessAudit", label: "Business Audit" },
    { key: "bugTracker",    label: "Bug Tracker" },
    { key: "hitlEdit",      label: "HITL Edit (Missing Fields)", accent: true },
  ];

  async function handleSave() {
    setSaving(true);
    try {
      await axios.patch(`/api/client-users/${user.internal_user_id}`, { pageAccess: access });
      toast.success("Page access updated — user must log out and back in for changes to take effect");
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to update page access");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 400, maxWidth: "90vw", background: "#ffffff", borderRadius: 12, border: "1px solid #e5e7eb", boxShadow: "0 12px 40px rgba(0,0,0,0.25)", padding: 22 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#111827" }}>Page Access</h2>
          <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#6b7280" }}>
            <X size={18} />
          </button>
        </div>
        <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "#6b7280" }}>
          {user.email} — toggle which pages this user can visit.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {PAGE_FLAGS.map((p) => (
            <label
              key={p.key}
              style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, color: "#111827", cursor: "pointer", padding: "8px 10px", borderRadius: 8, background: access[p.key] ? (p.accent ? "rgba(37,99,235,0.07)" : "rgba(34,197,94,0.07)") : "#f9fafb", border: `1px solid ${access[p.key] ? (p.accent ? "#93c5fd" : "#86efac") : "#e5e7eb"}`, transition: "background 0.15s, border-color 0.15s" }}
            >
              <input
                type="checkbox"
                checked={access[p.key]}
                onChange={() => toggle(p.key)}
                style={{ width: 15, height: 15, accentColor: p.accent ? "#2563eb" : "#16a34a", cursor: "pointer" }}
              />
              <span style={{ fontWeight: p.accent ? 600 : 400 }}>{p.label}</span>
              {p.accent && (
                <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", padding: "2px 7px", borderRadius: 999, background: "rgba(37,99,235,0.12)", color: "#2563eb" }}>
                  Opt-in
                </span>
              )}
            </label>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button type="button" onClick={onClose} disabled={saving} style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "1px solid #d1d5db", background: "#f3f4f6", color: "#111827", cursor: "pointer" }}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving} style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* Shared view+edit password panel — used for CLIENT_USER (by their own
   CLIENT_ADMIN) and internal team members (by SUPER_ADMIN). fetchUrl GET
   returns { email, isActive, password } (password null if not viewable);
   saveUrl PUT sets a new password from { newPassword }. */
function UserCredentialsModal({ title, fetchUrl, saveUrl, onClose }) {
  const [loading, setLoading] = useState(true);
  const [creds, setCreds] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    axios
      .get(fetchUrl)
      .then((res) => {
        if (!cancelled) setCreds(res.data);
      })
      .catch((err) => {
        toast.error(err?.response?.data?.error || "Failed to load credentials");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchUrl]);

  function copyPassword() {
    if (!creds?.password) return;
    navigator.clipboard.writeText(creds.password);
    toast.success("Password copied");
  }

  async function handleSetPassword() {
    if (!newPassword || newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSaving(true);
    try {
      await axios.put(saveUrl, { newPassword });
      setCreds((prev) => ({ ...prev, password: newPassword }));
      setNewPassword("");
      toast.success("Password updated");
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to set password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 420, maxWidth: "90vw", background: "#ffffff", borderRadius: 12, border: "1px solid #e5e7eb", boxShadow: "0 12px 40px rgba(0,0,0,0.25)", padding: 22 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#111827" }}>{title}</h2>
          <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#6b7280" }}>
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 20, textAlign: "center", color: "#6b7280", fontSize: 13 }}>Loading...</div>
        ) : !creds ? (
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>Not found.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={modalLabelStyle}>Email</label>
              <div style={{ ...modalFieldStyle, background: "#f9fafb" }}>{creds.email}</div>
            </div>

            <div>
              <label style={modalLabelStyle}>Current Password</label>
              {creds.password ? (
                <div style={{ position: "relative" }}>
                  <div style={{ ...modalFieldStyle, background: "#f9fafb", paddingRight: 64, fontFamily: "monospace" }}>
                    {showPassword ? creds.password : "•".repeat(Math.min(creds.password.length, 16))}
                  </div>
                  <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", display: "flex", gap: 6 }}>
                    <button type="button" onClick={() => setShowPassword((v) => !v)} title={showPassword ? "Hide" : "Show"} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#6b7280", display: "flex" }}>
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                    <button type="button" onClick={copyPassword} title="Copy" style={{ background: "transparent", border: "none", cursor: "pointer", color: "#6b7280", display: "flex" }}>
                      <Copy size={15} />
                    </button>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
                  Not viewable — set a new password below to make it viewable going forward.
                </p>
              )}
            </div>

            <div>
              <label style={modalLabelStyle}>Set New Password</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  name="new-password"
                  style={{ ...modalFieldStyle, paddingRight: 36 }}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((v) => !v)}
                  title={showNewPassword ? "Hide password" : "Show password"}
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: "#6b7280", display: "flex", alignItems: "center" }}
                >
                  {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <button
                type="button"
                onClick={handleSetPassword}
                disabled={saving}
                style={{ marginTop: 10, width: "100%", padding: "9px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}
              >
                {saving ? "Saving..." : "Save New Password"}
              </button>
            </div>

            <p style={{ fontSize: 11, color: "#9ca3af", margin: 0 }}>
              Status: {creds.isActive ? "Active" : "Inactive"}
            </p>
          </div>
        )}
      </div>
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
  const [credentialsMember, setCredentialsMember] = useState(null);

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
    if (!window.confirm(`Deactivate ${member.email}? They will no longer be able to log in, and any files still assigned to them will be unassigned.`)) return;
    try {
      const res = await axios.delete(`/api/team-members/${member.internal_user_id}`);
      const unassignedCount = res.data?.member?.unassignedCount || 0;
      toast.success(
        unassignedCount > 0
          ? `Team member deactivated. ${unassignedCount} assigned file(s) were unassigned and are available to reassign.`
          : "Team member deactivated"
      );
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
                        <button
                          type="button"
                          title="View/edit password"
                          onClick={() => setCredentialsMember(m)}
                          style={iconBtnStyle(false)}
                        >
                          <KeyRound size={14} />
                        </button>
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

      {credentialsMember && (
        <UserCredentialsModal
          title="Team Member Credentials"
          fetchUrl={`/api/team-members/${credentialsMember.internal_user_id}/credentials`}
          saveUrl={`/api/team-members/${credentialsMember.internal_user_id}/credentials`}
          onClose={() => setCredentialsMember(null)}
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

function PortalLoginBadge({ user }) {
  if (!user.portal_internal_user_id) {
    return (
      <span style={{ padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: "rgba(148,163,184,0.2)", color: "#64748b" }}>
        Not Provisioned
      </span>
    );
  }
  return (
    <span
      style={{
        padding: "3px 9px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: user.portal_is_active ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
        color: user.portal_is_active ? "#16a34a" : "#ef4444",
      }}
    >
      {user.portal_is_active ? "Active" : "Inactive"}
    </span>
  );
}

function ClientsTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState("last_login_at");
  const [sortOrder, setSortOrder] = useState("DESC");
  const [editingClient, setEditingClient] = useState(null);
  const [credentialsClient, setCredentialsClient] = useState(null);
  const [addSubUserClient, setAddSubUserClient] = useState(null);
  const [bulkProvisioning, setBulkProvisioning] = useState(false);
  const [expandedClients, setExpandedClients] = useState(new Set());
  const [editSubUserPageAccess, setEditSubUserPageAccess] = useState(null);

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

  // Every CLIENT_USER across every client, grouped client-side by client_id
  // — same "fetch once, group in memory" shape as Business Audit's
  // company → client grouping (app/dexai/page.js's groupedData).
  const { data: clientUsersAll = [] } = useQuery({
    queryKey: ["client-users-all"],
    queryFn: async () => (await axios.get("/api/client-users/all")).data.users || [],
  });
  const clientUsersByClientId = useMemo(() => {
    const map = {};
    for (const cu of clientUsersAll) {
      if (cu.client_id != null) {
        const cid = String(cu.client_id);
        (map[cid] ??= []).push(cu);
      }
    }
    return map;
  }, [clientUsersAll]);

  function toggleExpanded(userId) {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "ASC" ? "DESC" : "ASC");
    } else {
      setSortBy(column);
      setSortOrder("DESC");
    }
  };

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["clients"] });
  }

  async function handleBulkProvision() {
    setBulkProvisioning(true);
    try {
      const res = await axios.post("/api/user-logs/provision-all");
      const { created, failed } = res.data;
      if (created > 0) {
        toast.success(`Generated ${created} new portal login(s)`);
      } else {
        toast.success("All clients already have a portal login");
      }
      if (failed?.length) {
        toast.error(`${failed.length} client(s) could not be provisioned — check console`);
        console.warn("Bulk-provision failures:", failed);
      }
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to bulk-generate logins");
    } finally {
      setBulkProvisioning(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search by name, email, or company..." />
        <button
          type="button"
          onClick={handleBulkProvision}
          disabled={bulkProvisioning}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "9px 16px",
            borderRadius: 8,
            border: "1px solid var(--panel-border)",
            background: "var(--input-bg)",
            color: "var(--foreground)",
            fontSize: 13,
            fontWeight: 600,
            cursor: bulkProvisioning ? "not-allowed" : "pointer",
            opacity: bulkProvisioning ? 0.6 : 1,
            marginBottom: 20,
            height: "fit-content",
          }}
        >
          <RefreshCw size={15} /> {bulkProvisioning ? "Generating..." : "Refresh and Add"}
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
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading clients...</div>
        ) : error ? (
          <div style={{ padding: 40, textAlign: "center", color: "#dc2626" }}>Error loading clients</div>
        ) : users.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>No clients found</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--panel-border)", background: "var(--input-bg)" }}>
                <th style={{ padding: "12px 16px", width: 1 }} />
                <SortableHeader label="Name" column="first_name" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Email" column="email" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Company" column="company_name" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Created" column="created_at" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Last Updated" column="updated_at" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="Last Login" column="last_login_at" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Requests</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Portal Login</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, idx) => {
                const children = clientUsersByClientId[String(u.user_id)] || clientUsersByClientId[u.user_id] || [];
                const isExpanded = expandedClients.has(u.user_id);
                const isLastClient = idx === users.length - 1;
                return (
                  <Fragment key={u.user_id}>
                    <tr
                      style={{
                        borderBottom: !isExpanded && isLastClient ? "none" : "1px solid var(--panel-border)",
                        background: idx % 2 === 0 ? "transparent" : "var(--input-bg)",
                      }}
                    >
                      <td style={{ padding: "12px 16px" }}>
                        <button
                          type="button"
                          onClick={() => toggleExpanded(u.user_id)}
                          title={isExpanded ? "Hide users" : "Show users"}
                          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 6, border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer" }}
                        >
                          {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        </button>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--foreground)", fontWeight: 500 }}>
                        {fullName(u)}
                        {children.length > 0 && (
                          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "var(--tag-bg)", color: "var(--accent)" }}>
                            {children.length} user{children.length !== 1 ? "s" : ""}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)" }}>{u.email}</td>
                      <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)" }}>{u.company_name || "—"}</td>
                      <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)" }}>{formatDate(u.created_at)}</td>
                      <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)" }}>{formatDate(u.updated_at)}</td>
                      <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)" }}>{formatDate(u.last_login_at)}</td>
                      <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)", textAlign: "right" }}>{u.total_requests}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <PortalLoginBadge user={u} />
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 8 }}>
                          <button type="button" title="Add sub-user" onClick={() => setAddSubUserClient(u)} style={iconBtnStyle(false)}>
                            <UserPlus size={14} />
                          </button>
                          <button type="button" title="Edit client" onClick={() => setEditingClient(u)} style={iconBtnStyle(false)}>
                            <Pencil size={14} />
                          </button>
                          <button type="button" title="Portal credentials" onClick={() => setCredentialsClient(u)} style={iconBtnStyle(false)}>
                            <KeyRound size={14} />
                          </button>
                          <button
                            type="button"
                            title="Delete client"
                            onClick={async () => {
                              if (!window.confirm(`Are you sure you want to delete client "${u.email || u.user_id}"? All associated sub-users and portal access will be permanently removed.`)) return;
                              try {
                                await axios.delete(`/api/user-logs/${u.user_id}`);
                                toast.success("Client deleted");
                                queryClient.invalidateQueries({ queryKey: ["clients"] });
                                queryClient.invalidateQueries({ queryKey: ["client-users-all"] });
                              } catch (err) {
                                toast.error(err?.response?.data?.error || "Failed to delete client");
                              }
                            }}
                            style={iconBtnStyle(false, "#ef4444")}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {isExpanded && children.length === 0 && (
                      <tr style={{ borderBottom: isLastClient ? "none" : "1px solid var(--panel-border)", background: "var(--input-bg)" }}>
                        <td />
                        <td colSpan={9} style={{ padding: "10px 16px 10px 44px", fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                          No users added yet
                        </td>
                      </tr>
                    )}

                    {isExpanded &&
                      children.map((cu, cidx) => (
                        <tr
                          key={cu.internal_user_id}
                          style={{
                            borderBottom: isLastClient && cidx === children.length - 1 ? "none" : "1px solid var(--panel-border)",
                            background: "var(--input-bg)",
                            opacity: cu.is_active ? 1 : 0.55,
                          }}
                        >
                          <td />
                          <td style={{ padding: "10px 16px 10px 44px", fontSize: 12.5, color: "var(--foreground)" }}>{fullName(cu)}</td>
                          <td style={{ padding: "10px 16px", fontSize: 12.5, color: "var(--text-muted)" }}>{cu.email}</td>
                          <td style={{ padding: "10px 16px", fontSize: 12, color: "var(--text-muted)" }}>—</td>
                          <td style={{ padding: "10px 16px", fontSize: 12, color: "var(--text-muted)" }}>{formatDate(cu.created_at)}</td>
                          <td style={{ padding: "10px 16px", fontSize: 12, color: "var(--text-muted)" }}>—</td>
                          <td style={{ padding: "10px 16px", fontSize: 12, color: "var(--text-muted)" }}>{formatDate(cu.last_login_at)}</td>
                          <td style={{ padding: "10px 16px", fontSize: 12, color: "var(--text-muted)", textAlign: "right" }}>—</td>
                          <td style={{ padding: "10px 16px", fontSize: 11 }}>
                            <span
                              style={{
                                padding: "3px 9px",
                                borderRadius: 999,
                                fontWeight: 600,
                                background: cu.is_active ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                                color: cu.is_active ? "#16a34a" : "#ef4444",
                              }}
                            >
                              {cu.is_active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td style={{ padding: "10px 16px", textAlign: "right" }}>
                            <div style={{ display: "inline-flex", gap: 8, justifyContent: "flex-end" }}>
                              <button
                                type="button"
                                title="Edit page access"
                                onClick={() => setEditSubUserPageAccess(cu)}
                                style={iconBtnStyle(false)}
                              >
                                <ShieldCheck size={13} />
                              </button>
                              <button
                                type="button"
                                title="Delete sub-user"
                                onClick={async () => {
                                  if (!window.confirm(`Are you sure you want to delete sub-user "${cu.email}"?`)) return;
                                  try {
                                    await axios.delete(`/api/client-users/${cu.internal_user_id}`);
                                    toast.success("Sub-user deleted");
                                    queryClient.invalidateQueries({ queryKey: ["client-users-all"] });
                                  } catch (err) {
                                    toast.error(err?.response?.data?.error || "Failed to delete sub-user");
                                  }
                                }}
                                style={iconBtnStyle(false, "#ef4444")}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}

                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editingClient && (
        <EditClientModal
          client={editingClient}
          onClose={() => setEditingClient(null)}
          onSaved={() => {
            setEditingClient(null);
            refresh();
          }}
        />
      )}

      {credentialsClient && (
        <ClientCredentialsModal
          client={credentialsClient}
          onClose={() => setCredentialsClient(null)}
          onProvisioned={refresh}
        />
      )}

      {addSubUserClient && (
        <AddSubUserModal
          client={addSubUserClient}
          onClose={() => setAddSubUserClient(null)}
          onSaved={() => {
            const cid = addSubUserClient.user_id;
            setExpandedClients((prev) => new Set(prev).add(cid));
            setAddSubUserClient(null);
            queryClient.invalidateQueries({ queryKey: ["client-users-all"] });
            queryClient.invalidateQueries({ queryKey: ["clients"] });
          }}
        />
      )}

      {editSubUserPageAccess && (
        <EditPageAccessModal
          user={editSubUserPageAccess}
          onClose={() => setEditSubUserPageAccess(null)}
          onSaved={() => {
            setEditSubUserPageAccess(null);
            queryClient.invalidateQueries({ queryKey: ["client-users-all"] });
          }}
        />
      )}
    </div>
  );
}

// SUPER_ADMIN: add a sub-user to a specific client, choosing which pages the
// sub-user can see. Posts to /api/client-users with the target clientId +
// pageAccess (the route grants the CLIENT role and stores page_access).
function AddSubUserModal({ client, onClose, onSaved }) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [access, setAccess] = useState({ dashboard: true, businessAudit: true, bugTracker: true, hitlEdit: false });
  const [saving, setSaving] = useState(false);

  const toggle = (k) => setAccess((p) => ({ ...p, [k]: !p[k] }));

  const save = async () => {
    if (!email.trim() || password.length < 8) {
      toast.error("Email and a password of 8+ characters are required");
      return;
    }
    setSaving(true);
    try {
      await axios.post("/api/client-users", {
        clientId: client.user_id,
        email: email.trim(),
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        password,
        pageAccess: access,
      });
      toast.success("Sub-user added");
      onSaved?.();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to add sub-user");
    } finally {
      setSaving(false);
    }
  };

  const PAGES = [
    { key: "dashboard", label: "Dashboard" },
    { key: "businessAudit", label: "Business Audit" },
    { key: "bugTracker", label: "Bug Tracker" },
    { key: "hitlEdit", label: "HITL Edit (Missing Fields)" },
  ];

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: "90vw", maxHeight: "85vh", overflowY: "auto", background: "#ffffff", borderRadius: 12, border: "1px solid #e5e7eb", boxShadow: "0 12px 40px rgba(0,0,0,0.25)", padding: 22 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700, color: "#111827" }}>Add sub-user</h3>
        <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "#6b7280" }}>
          For {client.company_name || client.email} — scoped to this client only.
        </p>
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label style={modalLabelStyle}>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} style={modalFieldStyle} placeholder="user@example.com" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={modalLabelStyle}>First name</label><input value={firstName} onChange={(e) => setFirstName(e.target.value)} style={modalFieldStyle} /></div>
            <div><label style={modalLabelStyle}>Last name</label><input value={lastName} onChange={(e) => setLastName(e.target.value)} style={modalFieldStyle} /></div>
          </div>
          <div>
            <label style={modalLabelStyle}>Password</label>
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} style={modalFieldStyle} placeholder="min 8 characters" />
          </div>
          <div>
            <label style={modalLabelStyle}>Can access</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
              {PAGES.map((p) => (
                <label key={p.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#111827", cursor: "pointer" }}>
                  <input type="checkbox" checked={access[p.key]} onChange={() => toggle(p.key)} />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button type="button" onClick={onClose} style={{ ...modalFieldStyle, width: "auto", cursor: "pointer", background: "#f3f4f6" }}>Cancel</button>
          <button type="button" onClick={save} disabled={saving} style={{ ...modalFieldStyle, width: "auto", cursor: "pointer", background: "#2563eb", color: "#fff", border: "none", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Adding…" : "Add sub-user"}
          </button>
        </div>
      </div>
    </div>
  );
}

const modalFieldStyle = {
  fontSize: 13,
  padding: "9px 11px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#ffffff",
  color: "#111827",
  width: "100%",
};
const modalLabelStyle = { fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "block" };

function EditClientModal({ client, onClose, onSaved }) {
  const [email, setEmail] = useState(client.email || "");
  const [firstName, setFirstName] = useState(client.first_name || "");
  const [lastName, setLastName] = useState(client.last_name || "");
  const [companyName, setCompanyName] = useState(client.company_name || "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }
    setSaving(true);
    try {
      await axios.patch(`/api/user-logs/${client.user_id}`, {
        email: email.trim(),
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        companyName: companyName.trim() || null,
      });
      toast.success("Client updated");
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to update client");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 440, maxWidth: "90vw", maxHeight: "85vh", overflowY: "auto", background: "#ffffff", borderRadius: 12, border: "1px solid #e5e7eb", boxShadow: "0 12px 40px rgba(0,0,0,0.25)", padding: 22 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#111827" }}>Edit Client</h2>
          <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#6b7280" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={modalLabelStyle}>First Name</label>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="off" name="client-first-name" style={modalFieldStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={modalLabelStyle}>Last Name</label>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="off" name="client-last-name" style={modalFieldStyle} />
            </div>
          </div>

          <div>
            <label style={modalLabelStyle}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" name="client-email" style={modalFieldStyle} />
          </div>

          <div>
            <label style={modalLabelStyle}>Company</label>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} autoComplete="off" name="client-company" style={modalFieldStyle} />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 22 }}>
          <button type="button" onClick={onClose} disabled={saving} style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "1px solid #d1d5db", background: "#f3f4f6", color: "#111827", cursor: "pointer" }}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving} style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ClientCredentialsModal({ client, onClose, onProvisioned }) {
  const [loading, setLoading] = useState(true);
  const [provisioning, setProvisioning] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [creds, setCreds] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [settingPassword, setSettingPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;
    axios
      .get(`/api/user-logs/${client.user_id}/credentials`)
      .then((res) => {
        if (!cancelled) setCreds(res.data);
      })
      .catch((err) => {
        toast.error(err?.response?.data?.error || "Failed to load credentials");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client.user_id]);

  async function handleProvision() {
    setProvisioning(true);
    try {
      const res = await axios.post(`/api/user-logs/${client.user_id}/credentials`);
      setCreds({ provisioned: true, email: res.data.email, isActive: true, password: res.data.password });
      setShowPassword(true);
      toast.success("Portal login generated");
      onProvisioned();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to generate login");
    } finally {
      setProvisioning(false);
    }
  }

  function copyPassword() {
    if (!creds?.password) return;
    navigator.clipboard.writeText(creds.password);
    toast.success("Password copied");
  }

  async function handleSetPassword() {
    if (!newPassword || newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSettingPassword(true);
    try {
      await axios.put(`/api/user-logs/${client.user_id}/credentials`, { newPassword });
      setCreds((prev) => ({ ...prev, password: newPassword }));
      setNewPassword("");
      toast.success("Password updated");
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to set password");
    } finally {
      setSettingPassword(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 420, maxWidth: "90vw", background: "#ffffff", borderRadius: 12, border: "1px solid #e5e7eb", boxShadow: "0 12px 40px rgba(0,0,0,0.25)", padding: 22 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#111827" }}>Portal Login</h2>
          <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#6b7280" }}>
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 20, textAlign: "center", color: "#6b7280", fontSize: 13 }}>Loading...</div>
        ) : !creds?.provisioned ? (
          <div>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 16px" }}>
              This client doesn&apos;t have a portal login yet. Generate one to give them CLIENT_ADMIN access.
            </p>
            <button
              type="button"
              onClick={handleProvision}
              disabled={provisioning}
              style={{ width: "100%", padding: "10px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", cursor: provisioning ? "not-allowed" : "pointer", opacity: provisioning ? 0.7 : 1 }}
            >
              {provisioning ? "Generating..." : "Generate Login"}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={modalLabelStyle}>Email</label>
              <div style={{ ...modalFieldStyle, background: "#f9fafb" }}>{creds.email}</div>
            </div>
            <div>
              <label style={modalLabelStyle}>Password</label>
              {creds.password ? (
                <div style={{ position: "relative" }}>
                  <div style={{ ...modalFieldStyle, background: "#f9fafb", paddingRight: 64, fontFamily: "monospace" }}>
                    {showPassword ? creds.password : "•".repeat(Math.min(creds.password.length, 16))}
                  </div>
                  <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", display: "flex", gap: 6 }}>
                    <button type="button" onClick={() => setShowPassword((v) => !v)} title={showPassword ? "Hide" : "Show"} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#6b7280", display: "flex" }}>
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                    <button type="button" onClick={copyPassword} title="Copy" style={{ background: "transparent", border: "none", cursor: "pointer", color: "#6b7280", display: "flex" }}>
                      <Copy size={15} />
                    </button>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
                  This client changed their password themselves — it&apos;s no longer viewable here.
                </p>
              )}
            </div>

            <div>
              <label style={modalLabelStyle}>Set New Password</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  name="new-password"
                  style={{ ...modalFieldStyle, paddingRight: 36 }}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((v) => !v)}
                  title={showNewPassword ? "Hide password" : "Show password"}
                  style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: "#6b7280", display: "flex", alignItems: "center" }}
                >
                  {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <button
                type="button"
                onClick={handleSetPassword}
                disabled={settingPassword}
                style={{ marginTop: 10, width: "100%", padding: "9px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", cursor: settingPassword ? "not-allowed" : "pointer", opacity: settingPassword ? 0.7 : 1 }}
              >
                {settingPassword ? "Saving..." : "Save New Password"}
              </button>
            </div>

            <p style={{ fontSize: 11, color: "#9ca3af", margin: 0 }}>
              Status: {creds.isActive ? "Active" : "Inactive"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HITL Workload tab
// ---------------------------------------------------------------------------

/* Single-select dropdown (same pattern duplicated per-page in
   missing-fields/page.js, dexai/[userId]/page.js, and bug-tracker/page.js). */
function SearchableDropdown({ placeholder, searchPlaceholder = "Search...", options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const selected = options.find((o) => o.value === value) || null;
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  const choose = (val) => {
    onChange(val);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 200 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 12px",
          fontSize: 13,
          width: "100%",
          border: "1px solid var(--input-border)",
          borderRadius: 8,
          background: "var(--input-bg)",
          color: selected ? "var(--foreground)" : "var(--text-muted)",
          cursor: "pointer",
        }}
      >
        <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={14} style={{ color: "var(--text-muted)", flexShrink: 0, transform: open ? "rotate(180deg)" : "none" }} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 50,
            width: "max(100%, 240px)",
            background: "var(--menu-bg)",
            border: "1px solid var(--panel-border)",
            borderRadius: 8,
            boxShadow: "var(--shadow-sm)",
            padding: 4,
          }}
        >
          <div style={{ position: "relative", marginBottom: 4 }}>
            <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              autoComplete="off"
              style={{ width: "100%", padding: "8px 10px 8px 30px", fontSize: 13, border: "1px solid var(--input-border)", borderRadius: 6, background: "var(--input-bg)", color: "var(--foreground)", outline: "none" }}
            />
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            <div
              role="button"
              onClick={() => choose("")}
              style={{ padding: "8px 10px", borderRadius: 6, fontSize: 13, cursor: "pointer", color: "var(--text-muted)", background: value === "" ? "var(--input-bg)" : "transparent" }}
            >
              {placeholder}
            </div>
            {filtered.map((o) => (
              <div
                key={o.value}
                role="button"
                onClick={() => choose(o.value)}
                style={{ padding: "8px 10px", borderRadius: 6, fontSize: 13, cursor: "pointer", color: "var(--foreground)", background: value === o.value ? "var(--input-bg)" : "transparent" }}
              >
                {o.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const dateInputStyle = {
  padding: "9px 12px",
  fontSize: 13,
  border: "1px solid var(--input-border)",
  borderRadius: 8,
  background: "var(--input-bg)",
  color: "var(--foreground)",
  outline: "none",
};

function HitlWorkloadTab() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [companies, setCompanies] = useState([]);
  const [email, setEmail] = useState("");
  const [debouncedEmail, setDebouncedEmail] = useState("");
  const [docType, setDocType] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedEmail(email), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [email]);

  const { data: filterOptions } = useQuery({
    queryKey: ["filter-options"],
    queryFn: async () => (await axios.get("/api/filter-options")).data,
    staleTime: 10 * 60 * 1000,
  });
  const businessOptions = [
    { value: "NULL", label: "No Company" },
    ...(filterOptions?.businesses || []).map((b) => ({ value: b, label: b })),
  ];
  const docTypeOptions = (filterOptions?.docTypes || []).map((t) => ({ value: t, label: t }));

  const { data: members = [], isLoading, error } = useQuery({
    queryKey: ["hitl-stats", dateFrom, dateTo, companies, debouncedEmail, docType],
    queryFn: async () => {
      const res = await axios.get("/api/hitl-stats", {
        params: { dateFrom, dateTo, companies: companies.join(","), email: debouncedEmail, docType },
      });
      return res.data.members || [];
    },
  });

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 20,
          padding: 16,
          background: "var(--panel-bg, var(--card-bg))",
          border: "1px solid var(--panel-border)",
          borderRadius: 10,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: "var(--text-muted)" }}>From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={dateInputStyle} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: "var(--text-muted)" }}>To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={dateInputStyle} />
        </div>

        <MultiSelectDropdown
          placeholder="All Companies"
          searchPlaceholder="Search company..."
          emptyText="No companies"
          options={businessOptions}
          values={companies}
          onChange={setCompanies}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "var(--input-bg)", border: "1px solid var(--input-border)", borderRadius: 8, minWidth: 220 }}>
          <Search size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Filter by client email..."
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            style={{ flex: 1, background: "transparent", border: "none", fontSize: 13, color: "var(--foreground)", outline: "none" }}
          />
        </div>

        <SearchableDropdown placeholder="All Document Types" searchPlaceholder="Search type..." options={docTypeOptions} value={docType} onChange={setDocType} />
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
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Loading HITL workload...</div>
        ) : error ? (
          <div style={{ padding: 40, textAlign: "center", color: "#dc2626" }}>Error loading HITL workload</div>
        ) : members.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>No HITL members found</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--panel-border)", background: "var(--input-bg)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Name</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Email</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Status</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Pending</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Pending %</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Completed</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Completed %</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m, idx) => (
                <tr
                  key={m.internalUserId}
                  style={{
                    borderBottom: idx < members.length - 1 ? "1px solid var(--panel-border)" : "none",
                    background: idx % 2 === 0 ? "transparent" : "var(--input-bg)",
                    opacity: m.isActive ? 1 : 0.55,
                  }}
                >
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--foreground)", fontWeight: 500 }}>
                    {fullName({ first_name: m.firstName, last_name: m.lastName })}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)" }}>{m.email}</td>
                  <td style={{ padding: "12px 16px", fontSize: 12 }}>
                    <span
                      style={{
                        padding: "3px 9px",
                        borderRadius: 999,
                        fontWeight: 600,
                        background: m.isActive ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                        color: m.isActive ? "#16a34a" : "#ef4444",
                      }}
                    >
                      {m.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--foreground)", textAlign: "right" }}>{m.pending}</td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)", textAlign: "right" }}>{m.pendingPct}%</td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--foreground)", textAlign: "right" }}>{m.completed}</td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-muted)", textAlign: "right" }}>{m.completedPct}%</td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--foreground)", fontWeight: 600, textAlign: "right" }}>{m.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
