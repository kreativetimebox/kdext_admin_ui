"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import toast from "react-hot-toast";
import {
  Search,
  AlertCircle,
  Users,
  ChevronRight,
  ChevronDown,
  X,
  Mail,
  Activity,
  CheckCircle2,
  XCircle,
  UserCircle,
  Building2,
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

function CompanySection({ company, users, onUserOpen }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ borderBottom: "1px solid var(--panel-border)" }}>
      {/* Company Header */}
      <div
        role="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px 20px",
          background: "linear-gradient(135deg, var(--input-bg) 0%, transparent 100%)",
          cursor: "pointer",
          transition: "background 0.12s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "linear-gradient(135deg, var(--panel-border) 0%, transparent 100%)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "linear-gradient(135deg, var(--input-bg) 0%, transparent 100%)";
        }}
      >
        <Building2 size={18} style={{ color: "#2563eb", flexShrink: 0 }} />
        <span
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: "var(--foreground)",
            flex: 1,
          }}
        >
          {company || "Unknown Company"}
        </span>
        <span
          style={{
            fontSize: 12,
            background: "var(--tag-bg)",
            color: "var(--accent)",
            padding: "4px 10px",
            borderRadius: 6,
            fontWeight: 600,
          }}
        >
          {users.length} user{users.length !== 1 ? "s" : ""}
        </span>
        {expanded ? (
          <ChevronDown size={18} style={{ color: "var(--accent)", flexShrink: 0 }} />
        ) : (
          <ChevronRight size={18} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        )}
      </div>

      {/* Users */}
      {expanded &&
        users.map((user) => <UserRow key={user.user_id} user={user} onOpen={onUserOpen} />)}
    </div>
  );
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
        gridTemplateColumns: "minmax(220px, 1.4fr) minmax(220px, 1.2fr) 110px 130px 130px 180px 36px",
        gap: 16,
        alignItems: "center",
        padding: "12px 20px 12px 60px",
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
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #2563eb 0%, #6366f1 100%)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {initialsOf(user)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
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
              fontSize: 10,
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
          fontSize: 11,
          fontWeight: 700,
          padding: "3px 8px",
          borderRadius: 6,
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
          fontSize: 11,
          fontWeight: 600,
          color: "var(--tag-green-color)",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <CheckCircle2 size={11} />
        {user.completed_count}
      </span>

      {/* failed */}
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: user.failed_count > 0 ? "#b91c1c" : "var(--text-muted)",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <XCircle size={11} />
        {user.failed_count}
      </span>

      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
        {formatDate(user.last_submitted_at || user.created_at)}
      </span>

      <ChevronRight
        size={14}
        style={{ color: hovered ? "var(--accent)" : "var(--text-muted)" }}
      />
    </div>
  );
}

function menuItemBaseStyle(active) {
  return {
    padding: "8px 10px",
    borderRadius: 6,
    fontSize: 13,
    cursor: "pointer",
    color: "var(--foreground)",
    background: active ? "var(--input-bg)" : "transparent",
    transition: "background 0.1s ease",
  };
}

function SearchableDropdown({
  icon: Icon,
  placeholder,
  searchPlaceholder = "Search...",
  emptyText = "No results",
  options,
  value,
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);
  const inputRef = useRef(null);

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

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const selected = options.find((o) => o.value === value) || null;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          (o.sublabel || "").toLowerCase().includes(q)
      )
    : options;

  const choose = (val) => {
    onChange(val);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 210 }}>
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
          outline: "none",
        }}
      >
        {Icon && <Icon size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />}
        <span
          style={{
            flex: 1,
            textAlign: "left",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          style={{
            color: "var(--text-muted)",
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.12s ease",
          }}
        />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 50,
            width: "max(100%, 260px)",
            background: "var(--panel-bg)",
            border: "1px solid var(--panel-border)",
            borderRadius: 8,
            boxShadow: "var(--shadow-sm)",
            padding: 4,
          }}
        >
          {/* Search box */}
          <div style={{ position: "relative", marginBottom: 4 }}>
            <Search
              size={13}
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              style={{
                width: "100%",
                padding: "8px 10px 8px 30px",
                fontSize: 13,
                border: "1px solid var(--input-border)",
                borderRadius: 6,
                background: "var(--input-bg)",
                color: "var(--foreground)",
                outline: "none",
              }}
            />
          </div>

          {/* Options */}
          <div style={{ maxHeight: 280, overflowY: "auto", overflowX: "hidden" }}>
            <div
              role="button"
              onClick={() => choose("")}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--input-bg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = value === "" ? "var(--input-bg)" : "transparent";
              }}
              style={menuItemBaseStyle(value === "")}
            >
              {placeholder}
            </div>

            {filtered.length === 0 ? (
              <div style={{ padding: "10px", fontSize: 12, color: "var(--text-muted)" }}>
                {emptyText}
              </div>
            ) : (
              filtered.map((o) => (
                <div
                  key={o.value}
                  role="button"
                  onClick={() => choose(o.value)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--input-bg)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = o.value === value ? "var(--input-bg)" : "transparent";
                  }}
                  style={{
                    ...menuItemBaseStyle(o.value === value),
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--foreground)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {o.label}
                  </span>
                  {o.sublabel && (
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--text-muted)",
                        fontFamily: "ui-monospace, SFMono-Regular, monospace",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {o.sublabel}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DexaiUsersPage() {
  const { initTheme } = useThemeStore();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedCompany, setSelectedCompany] = useState("");
  const [selectedClient, setSelectedClient] = useState("");

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

  // Get unique companies
  const uniqueCompanies = useMemo(() => {
    const companySet = new Set();
    users.forEach((u) => {
      if (u.company_name) companySet.add(u.company_name);
    });
    return Array.from(companySet).sort();
  }, [users]);

  // Company dropdown options
  const companyOptions = useMemo(
    () => uniqueCompanies.map((c) => ({ value: c, label: c })),
    [uniqueCompanies]
  );

  // Client (user) dropdown options — scoped to the selected company when one is chosen
  const clientOptions = useMemo(() => {
    const base = selectedCompany
      ? users.filter((u) => (u.company_name || "Unknown Company") === selectedCompany)
      : users;
    return base
      .map((u) => ({
        value: String(u.user_id),
        label: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email,
        sublabel: u.email,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [users, selectedCompany]);

  // Group users by company with filtering
  const groupedData = useMemo(() => {
    const q = search.trim().toLowerCase();
    let filtered = users;

    if (q) {
      filtered = users.filter(
        (u) =>
          (u.email || "").toLowerCase().includes(q) ||
          (u.first_name || "").toLowerCase().includes(q) ||
          (u.last_name || "").toLowerCase().includes(q) ||
          (u.company_name || "").toLowerCase().includes(q) ||
          (u.request_ids || "").toLowerCase().includes(q) ||
          (u.result_ids || "").toLowerCase().includes(q) ||
          String(u.user_id).includes(q)
      );
    }

    // Apply dropdown filters
    if (selectedCompany) {
      filtered = filtered.filter((u) => u.company_name === selectedCompany);
    }
    if (selectedClient) {
      filtered = filtered.filter((u) => String(u.user_id) === selectedClient);
    }

    // Group by company -> users
    const companies = {};
    filtered.forEach((user) => {
      const company = user.company_name || "Unknown Company";
      if (!companies[company]) {
        companies[company] = [];
      }
      companies[company].push(user);
    });

    return companies;
  }, [users, search, selectedCompany, selectedClient]);

  const visibleUsers = useMemo(() => {
    return Object.values(groupedData).reduce((acc, userList) => {
      acc.push(...userList);
      return acc;
    }, []);
  }, [groupedData]);

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
              background: "linear-gradient(135deg, #0891b2 0%, #2563eb 100%)",
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
              Business Audit
            </h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
              View all companies and users from{" "}
              <span style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>
                MAIN_FINANCE_DB
              </span>
              . Click a company to expand and see its users.
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
          {/* Company Dropdown (searchable) */}
          <SearchableDropdown
            icon={Building2}
            placeholder="All Companies"
            searchPlaceholder="Search company..."
            emptyText="No companies"
            options={companyOptions}
            value={selectedCompany}
            onChange={(v) => {
              setSelectedCompany(v);
              setSelectedClient("");
            }}
          />

          {/* Client Dropdown (searchable) */}
          <SearchableDropdown
            icon={UserCircle}
            placeholder="All Clients"
            searchPlaceholder="Search client..."
            emptyText="No clients"
            options={clientOptions}
            value={selectedClient}
            onChange={setSelectedClient}
          />

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
              placeholder="Search by company, user, request ID, or result ID..."
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
          {(search || selectedCompany || selectedClient) && (
            <button
              onClick={() => {
                setSearch("");
                setSelectedCompany("");
                setSelectedClient("");
              }}
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
              Clear All
            </button>
          )}
        </div>

        {/* Businesses List */}
        <div
          style={{
            background: "var(--panel-bg)",
            border: "1px solid var(--panel-border)",
            borderRadius: 12,
            boxShadow: "var(--shadow-sm)",
            overflow: "hidden",
          }}
        >
          {isLoading ? (
            <div
              style={{
                padding: 40,
                textAlign: "center",
                color: "var(--text-muted)",
              }}
            >
              Loading companies...
            </div>
          ) : error ? (
            <div style={{ padding: 40, textAlign: "center", color: "#ef4444" }}>
              <AlertCircle size={32} style={{ marginBottom: 12 }} />
              <p>Failed to load data</p>
            </div>
          ) : Object.keys(groupedData).length === 0 ? (
            <div style={{ padding: 60, textAlign: "center" }}>
              <Building2
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
              <div>
                {Object.entries(groupedData).map(([company, userList]) => (
                  <CompanySection
                    key={company}
                    company={company}
                    users={userList}
                    onUserOpen={handleOpen}
                  />
                ))}
              </div>
            )}
        </div>
      </main>
    </div>
  );
}
