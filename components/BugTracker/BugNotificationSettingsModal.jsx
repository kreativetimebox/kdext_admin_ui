"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import {
  Bell,
  X,
  Plus,
  Send,
  History,
  Settings,
  Check,
  AlertCircle,
  Clock,
  User,
  Shield,
  ChevronLeft,
  ChevronRight,
  Mail,
  RefreshCw,
} from "lucide-react";

export default function BugNotificationSettingsModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState("config"); // "config" | "audit"
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Settings state
  const [selectedClientId, setSelectedClientId] = useState(""); // "" = Global
  const [clients, setClients] = useState([]);
  const [globalSettings, setGlobalSettings] = useState(null);
  const [clientOverrides, setClientOverrides] = useState([]);

  // Form state
  const [enabled, setEnabled] = useState(true);
  const [notifyBugCreated, setNotifyBugCreated] = useState(true);
  const [notifyBugStatusChanged, setNotifyBugStatusChanged] = useState(true);
  const [notifyActionStatusChanged, setNotifyActionStatusChanged] = useState(true);
  const [notifyBugAssigned, setNotifyBugAssigned] = useState(true);
  const [notifyCommentAdded, setNotifyCommentAdded] = useState(true);
  const [notifyBugUpdated, setNotifyBugUpdated] = useState(true);
  const [notifyBugClosed, setNotifyBugClosed] = useState(true);
  const [notifyDocumentUpdated, setNotifyDocumentUpdated] = useState(true);

  const [recipientBugOwner, setRecipientBugOwner] = useState(true);
  const [recipientClientAdmin, setRecipientClientAdmin] = useState(true);
  const [recipientInternalTeam, setRecipientInternalTeam] = useState(false);

  const [customRecipients, setCustomRecipients] = useState([]);
  const [newEmailInput, setNewEmailInput] = useState("");

  const [ccInput, setCcInput] = useState("");
  const [bccInput, setBccInput] = useState("");

  // Test email state
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [showTestBox, setShowTestBox] = useState(false);

  // Audit log state
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditStatusFilter, setAuditStatusFilter] = useState("");

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/bug-tracker/notifications/settings");
      if (res.data?.ok) {
        setGlobalSettings(res.data.global);
        setClientOverrides(res.data.clientOverrides || []);
        setClients(res.data.clients || []);
        applyFormValues(res.data.global);
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to load notification settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && activeTab === "audit") {
      loadAuditLogs(auditPage, auditStatusFilter);
    }
  }, [isOpen, activeTab, auditPage, auditStatusFilter]);


  function applyFormValues(s) {
    if (!s) return;
    setEnabled(s.enabled ?? true);
    setNotifyBugCreated(s.notify_bug_created ?? true);
    setNotifyBugStatusChanged(s.notify_bug_status_changed ?? true);
    setNotifyActionStatusChanged(s.notify_action_status_changed ?? true);
    setNotifyBugAssigned(s.notify_bug_assigned ?? true);
    setNotifyCommentAdded(s.notify_comment_added ?? true);
    setNotifyBugUpdated(s.notify_bug_updated ?? true);
    setNotifyBugClosed(s.notify_bug_closed ?? true);
    setNotifyDocumentUpdated(s.notify_document_updated ?? true);

    setRecipientBugOwner(s.recipient_bug_owner ?? true);
    setRecipientClientAdmin(s.recipient_client_admin ?? true);
    setRecipientInternalTeam(s.recipient_internal_team ?? false);

    setCustomRecipients(Array.isArray(s.custom_recipients) ? s.custom_recipients : []);
    setCcInput(Array.isArray(s.cc) ? s.cc.join(", ") : "");
    setBccInput(Array.isArray(s.bcc) ? s.bcc.join(", ") : "");
  }

  function handleScopeChange(cId) {
    setSelectedClientId(cId);
    if (!cId) {
      applyFormValues(globalSettings);
    } else {
      const match = clientOverrides.find((o) => String(o.client_id) === String(cId));
      if (match) {
        applyFormValues(match);
      } else {
        // Inherit global as starter template
        applyFormValues(globalSettings);
      }
    }
  }

  function handleAddCustomRecipient() {
    const email = newEmailInput.trim().toLowerCase();
    if (!email) return;
    if (!email.includes("@") || !email.includes(".")) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (customRecipients.includes(email)) {
      toast.error("Email is already in the recipient list");
      return;
    }
    setCustomRecipients([...customRecipients, email]);
    setNewEmailInput("");
  }

  function handleRemoveCustomRecipient(email) {
    setCustomRecipients(customRecipients.filter((e) => e !== email));
  }

  async function handleSaveSettings() {
    setSaving(true);
    try {
      const parseList = (str) =>
        str
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter((s) => s.includes("@"));

      const payload = {
        clientId: selectedClientId ? Number(selectedClientId) : null,
        enabled,
        notifyBugCreated,
        notifyBugStatusChanged,
        notifyActionStatusChanged,
        notifyBugAssigned,
        notifyCommentAdded,
        notifyBugUpdated,
        notifyBugClosed,
        notifyDocumentUpdated,
        recipientBugOwner,
        recipientClientAdmin,
        recipientInternalTeam,
        customRecipients,
        cc: parseList(ccInput),
        bcc: parseList(bccInput),
      };

      const res = await axios.post("/api/bug-tracker/notifications/settings", payload);
      if (res.data?.ok) {
        toast.success(
          selectedClientId
            ? "Client notification rules saved!"
            : "Global notification rules saved!"
        );
        loadSettings();
      } else {
        toast.error(res.data?.error || "Failed to save settings");
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleSendTest() {
    const email = testEmail.trim();
    if (!email || !email.includes("@")) {
      toast.error("Enter a valid recipient email for the test");
      return;
    }
    setSendingTest(true);
    try {
      const res = await axios.post("/api/bug-tracker/notifications/test", { email });
      if (res.data?.ok) {
        toast.success(res.data.message || "Test email delivered successfully!");
        setTestEmail("");
        setShowTestBox(false);
      } else if (res.data?.warning) {
        toast(res.data.error, { icon: "⚠️", duration: 6000 });
      } else {
        toast.error(res.data?.error || "Failed to send test email");
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || "Test email request failed");
    } finally {
      setSendingTest(false);
    }
  }

  async function loadAuditLogs(page = 1, status = "") {
    setAuditLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "15" });
      if (status) params.append("status", status);
      const res = await axios.get(`/api/bug-tracker/notifications/logs?${params.toString()}`);
      if (res.data?.ok) {
        setAuditLogs(res.data.logs || []);
        setAuditTotal(res.data.total || 0);
      }
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    } finally {
      setAuditLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 99,
          background: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(2px)",
        }}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 100,
          width: "min(720px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 48px)",
          display: "flex",
          flexDirection: "column",
          background: "var(--panel-bg)",
          border: "1px solid var(--panel-border)",
          borderRadius: 16,
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--panel-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--input-bg)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: "var(--brand-gradient)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
              }}
            >
              <Bell size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--foreground)", margin: 0 }}>
                Bug Notification Settings
              </h2>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0 0" }}>
                Configurable email alerts and delivery audit logs for bug ticket events.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              padding: 6,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--panel-border)",
            padding: "0 24px",
            background: "var(--panel-bg)",
            gap: 20,
          }}
        >
          <button
            onClick={() => setActiveTab("config")}
            style={{
              padding: "12px 4px",
              fontSize: 13,
              fontWeight: 600,
              background: "none",
              border: "none",
              borderBottom: activeTab === "config" ? "2px solid #6366f1" : "2px solid transparent",
              color: activeTab === "config" ? "var(--foreground)" : "var(--text-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <Settings size={14} />
            Configuration
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            style={{
              padding: "12px 4px",
              fontSize: 13,
              fontWeight: 600,
              background: "none",
              border: "none",
              borderBottom: activeTab === "audit" ? "2px solid #6366f1" : "2px solid transparent",
              color: activeTab === "audit" ? "var(--foreground)" : "var(--text-muted)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <History size={14} />
            Audit History
            {auditTotal > 0 && (
              <span
                style={{
                  fontSize: 11,
                  padding: "1px 6px",
                  borderRadius: 99,
                  background: "var(--input-bg)",
                  border: "1px solid var(--panel-border)",
                  color: "var(--text-muted)",
                }}
              >
                {auditTotal}
              </span>
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "24px", overflowY: "auto", flex: 1, maxHeight: "calc(100vh - 240px)" }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              Loading settings...
            </div>
          ) : activeTab === "config" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {/* Scope & Master Toggle Card */}
              <div
                style={{
                  padding: 16,
                  borderRadius: 12,
                  background: "var(--input-bg)",
                  border: "1px solid var(--panel-border)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                      Configuration Scope
                    </label>
                    <select
                      value={selectedClientId}
                      onChange={(e) => handleScopeChange(e.target.value)}
                      style={{
                        padding: "7px 12px",
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        border: "1px solid var(--input-border)",
                        background: "var(--panel-bg)",
                        color: "var(--foreground)",
                        cursor: "pointer",
                        outline: "none",
                        minWidth: 260,
                      }}
                    >
                      <option value="">🌐 Global Default (All Clients)</option>
                      {clients.map((c) => {
                        const hasOverride = clientOverrides.some((o) => String(o.client_id) === String(c.user_id));
                        return (
                          <option key={c.user_id} value={c.user_id}>
                            🏢 {c.display_name} {hasOverride ? "★ (Custom Rule)" : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Enable Notifications Switch */}
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                      Email Notifications
                    </span>
                    <button
                      type="button"
                      onClick={() => setEnabled(!enabled)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 14px",
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        cursor: "pointer",
                        border: enabled ? "1px solid #22c55e" : "1px solid var(--panel-border)",
                        background: enabled ? "rgba(34, 197, 94, 0.12)" : "var(--panel-bg)",
                        color: enabled ? "#22c55e" : "var(--text-muted)",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: enabled ? "#22c55e" : "var(--text-muted)",
                        }}
                      />
                      {enabled ? "ON" : "OFF"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Recipients Section */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>
                  Recipients
                </span>

                {/* Role Toggles */}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setRecipientBugOwner(!recipientBugOwner)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 12px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      border: recipientBugOwner ? "1px solid #6366f1" : "1px solid var(--panel-border)",
                      background: recipientBugOwner ? "rgba(99, 102, 241, 0.12)" : "var(--input-bg)",
                      color: recipientBugOwner ? "#6366f1" : "var(--text-muted)",
                    }}
                  >
                    {recipientBugOwner && <Check size={12} />}
                    Bug Owner (Assignee)
                  </button>

                  <button
                    type="button"
                    onClick={() => setRecipientClientAdmin(!recipientClientAdmin)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 12px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      border: recipientClientAdmin ? "1px solid #6366f1" : "1px solid var(--panel-border)",
                      background: recipientClientAdmin ? "rgba(99, 102, 241, 0.12)" : "var(--input-bg)",
                      color: recipientClientAdmin ? "#6366f1" : "var(--text-muted)",
                    }}
                  >
                    {recipientClientAdmin && <Check size={12} />}
                    Client Admin
                  </button>

                  <button
                    type="button"
                    onClick={() => setRecipientInternalTeam(!recipientInternalTeam)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 12px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      border: recipientInternalTeam ? "1px solid #6366f1" : "1px solid var(--panel-border)",
                      background: recipientInternalTeam ? "rgba(99, 102, 241, 0.12)" : "var(--input-bg)",
                      color: recipientInternalTeam ? "#6366f1" : "var(--text-muted)",
                    }}
                  >
                    {recipientInternalTeam && <Check size={12} />}
                    Internal Team
                  </button>
                </div>

                {/* Custom Email List & Input */}
                <div style={{ marginTop: 6 }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    {customRecipients.map((email) => (
                      <span
                        key={email}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "4px 10px",
                          borderRadius: 6,
                          background: "var(--tag-bg)",
                          border: "1px solid var(--panel-border)",
                          fontSize: 12,
                          color: "var(--foreground)",
                        }}
                      >
                        {email}
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomRecipient(email)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                            color: "var(--text-muted)",
                            display: "flex",
                          }}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="email"
                      value={newEmailInput}
                      onChange={(e) => setNewEmailInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddCustomRecipient();
                        }
                      }}
                      placeholder="Add specific email address (e.g. alerts@company.com)..."
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        fontSize: 13,
                        borderRadius: 8,
                        border: "1px solid var(--input-border)",
                        background: "var(--input-bg)",
                        color: "var(--foreground)",
                        outline: "none",
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomRecipient}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "8px 14px",
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        border: "1px solid var(--panel-border)",
                        background: "var(--input-bg)",
                        color: "var(--foreground)",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Plus size={13} /> Add Email +
                    </button>
                  </div>
                </div>
              </div>

              {/* Event Triggers Checklist */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>
                    Notify me when:
                  </span>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setNotifyBugCreated(true);
                        setNotifyBugStatusChanged(true);
                        setNotifyActionStatusChanged(true);
                        setNotifyBugAssigned(true);
                        setNotifyCommentAdded(true);
                        setNotifyBugUpdated(true);
                        setNotifyBugClosed(true);
                        setNotifyDocumentUpdated(true);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#6366f1",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      Select All
                    </button>
                    <span style={{ color: "var(--text-muted)", fontSize: 11 }}>·</span>
                    <button
                      type="button"
                      onClick={() => {
                        setNotifyBugCreated(false);
                        setNotifyBugStatusChanged(false);
                        setNotifyActionStatusChanged(false);
                        setNotifyBugAssigned(false);
                        setNotifyCommentAdded(false);
                        setNotifyBugUpdated(false);
                        setNotifyBugClosed(false);
                        setNotifyDocumentUpdated(false);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--text-muted)",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                    gap: 10,
                  }}
                >
                  {[
                    { label: "Bug Created", checked: notifyBugCreated, set: setNotifyBugCreated },
                    { label: "Bug Status Changed", checked: notifyBugStatusChanged, set: setNotifyBugStatusChanged },
                    { label: "Action Status Changed", checked: notifyActionStatusChanged, set: setNotifyActionStatusChanged },
                    { label: "Bug Assigned / Reassigned", checked: notifyBugAssigned, set: setNotifyBugAssigned },
                    { label: "Comment Added", checked: notifyCommentAdded, set: setNotifyCommentAdded },
                    { label: "Bug Details Updated", checked: notifyBugUpdated, set: setNotifyBugUpdated },
                    { label: "Bug Closed", checked: notifyBugClosed, set: setNotifyBugClosed },
                    { label: "Document Updated", checked: notifyDocumentUpdated, set: setNotifyDocumentUpdated },
                  ].map((item) => (
                    <label
                      key={item.label}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        borderRadius: 8,
                        background: item.checked ? "rgba(99, 102, 241, 0.05)" : "var(--input-bg)",
                        border: item.checked ? "1px solid rgba(99, 102, 241, 0.25)" : "1px solid var(--panel-border)",
                        fontSize: 13,
                        color: "var(--foreground)",
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={(e) => item.set(e.target.checked)}
                        style={{ cursor: "pointer", accentColor: "#6366f1" }}
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* CC & BCC */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>
                    CC (comma-separated):
                  </label>
                  <input
                    type="text"
                    value={ccInput}
                    onChange={(e) => setCcInput(e.target.value)}
                    placeholder="manager@domain.com, team@domain.com"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: 12,
                      borderRadius: 8,
                      border: "1px solid var(--input-border)",
                      background: "var(--input-bg)",
                      color: "var(--foreground)",
                      outline: "none",
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>
                    BCC (comma-separated):
                  </label>
                  <input
                    type="text"
                    value={bccInput}
                    onChange={(e) => setBccInput(e.target.value)}
                    placeholder="audit@domain.com, archive@domain.com"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: 12,
                      borderRadius: 8,
                      border: "1px solid var(--input-border)",
                      background: "var(--input-bg)",
                      color: "var(--foreground)",
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              {/* Test Email Accordion */}
              <div style={{ borderTop: "1px solid var(--panel-border)", paddingTop: 16 }}>
                {!showTestBox ? (
                  <button
                    type="button"
                    onClick={() => setShowTestBox(true)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      background: "none",
                      border: "none",
                      color: "#6366f1",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    <Send size={12} /> Send Test Email
                  </button>
                ) : (
                  <div
                    style={{
                      padding: 14,
                      borderRadius: 10,
                      background: "var(--input-bg)",
                      border: "1px solid var(--panel-border)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)" }}>
                        Verify Live Email Delivery
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowTestBox(false)}
                        style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 0 }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="email"
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                        placeholder="Recipient email address..."
                        style={{
                          flex: 1,
                          padding: "7px 10px",
                          fontSize: 12,
                          borderRadius: 6,
                          border: "1px solid var(--input-border)",
                          background: "var(--panel-bg)",
                          color: "var(--foreground)",
                          outline: "none",
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleSendTest}
                        disabled={sendingTest}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "7px 14px",
                          borderRadius: 6,
                          background: "var(--brand-gradient)",
                          color: "#fff",
                          fontSize: 12,
                          fontWeight: 600,
                          border: "none",
                          cursor: sendingTest ? "wait" : "pointer",
                          opacity: sendingTest ? 0.7 : 1,
                        }}
                      >
                        {sendingTest ? "Sending..." : "Send Test"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Audit Log Tab */
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <select
                    value={auditStatusFilter}
                    onChange={(e) => {
                      setAuditStatusFilter(e.target.value);
                      setAuditPage(1);
                    }}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      fontSize: 12,
                      border: "1px solid var(--input-border)",
                      background: "var(--input-bg)",
                      color: "var(--foreground)",
                      outline: "none",
                    }}
                  >
                    <option value="">All Statuses</option>
                    <option value="SENT">Sent</option>
                    <option value="FAILED">Failed</option>
                    <option value="NO_SMTP_CONFIG">No SMTP Config</option>
                    <option value="DISABLED">Disabled</option>
                    <option value="MUTED">Muted</option>
                    <option value="NO_RECIPIENTS">No Recipients</option>
                  </select>
                </div>
                <button
                  onClick={() => loadAuditLogs(auditPage, auditStatusFilter)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "6px 12px",
                    borderRadius: 6,
                    fontSize: 12,
                    background: "var(--input-bg)",
                    border: "1px solid var(--panel-border)",
                    color: "var(--foreground)",
                    cursor: "pointer",
                  }}
                >
                  <RefreshCw size={12} /> Refresh
                </button>
              </div>

              {auditLoading ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                  Loading audit logs...
                </div>
              ) : auditLogs.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
                  <History size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
                  <p style={{ margin: 0, fontSize: 13 }}>No notification history recorded yet.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {auditLogs.map((log) => {
                    const isSuccess = log.email_status === "SENT";
                    const isFailed = log.email_status === "FAILED";
                    const isPending = log.email_status === "NO_SMTP_CONFIG";

                    const badgeColor = isSuccess
                      ? "#22c55e"
                      : isFailed
                      ? "#ef4444"
                      : isPending
                      ? "#f97316"
                      : "var(--text-muted)";

                    const bugLabel = log.bug_tracker_id
                      ? `BUG-${String(log.bug_tracker_id).padStart(5, "0")}`
                      : log.result_id || "System";

                    let toList = [];
                    try {
                      const rec = typeof log.recipients === "string" ? JSON.parse(log.recipients) : log.recipients;
                      toList = Array.isArray(rec?.to) ? rec.to : [];
                    } catch {
                      toList = [];
                    }

                    return (
                      <div
                        key={log.id}
                        style={{
                          padding: "12px 14px",
                          borderRadius: 8,
                          background: "var(--input-bg)",
                          border: "1px solid var(--panel-border)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                          fontSize: 12,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span
                              style={{
                                padding: "2px 7px",
                                borderRadius: 99,
                                fontSize: 10,
                                fontWeight: 700,
                                background: `${badgeColor}18`,
                                color: badgeColor,
                                border: `1px solid ${badgeColor}33`,
                              }}
                            >
                              {log.email_status}
                            </span>
                            <span style={{ fontWeight: 700, color: "var(--foreground)", fontFamily: "monospace" }}>
                              {bugLabel}
                            </span>
                            <span style={{ color: "var(--text-muted)" }}>·</span>
                            <span style={{ fontWeight: 600, color: "var(--foreground)" }}>
                              {log.event_type}
                            </span>
                          </div>
                          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                            {log.created_at ? new Date(log.created_at).toLocaleString() : "—"}
                          </span>
                        </div>

                        <div style={{ color: "var(--text-muted)", fontSize: 11, display: "flex", gap: 12, flexWrap: "wrap" }}>
                          <span>
                            <strong>By:</strong> {log.changed_by || "System"}
                          </span>
                          {log.field_name && (
                            <span>
                              <strong>Field:</strong> {log.field_name} (
                              {log.previous_value || "—"} &rarr; {log.new_value || "—"})
                            </span>
                          )}
                          {toList.length > 0 && (
                            <span>
                              <strong>To:</strong> {toList.join(", ")}
                            </span>
                          )}
                        </div>

                        {log.error_message && (
                          <div style={{ color: "#ef4444", fontSize: 11, background: "rgba(239,68,68,0.08)", padding: "4px 8px", borderRadius: 4 }}>
                            {log.error_message}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Pagination */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 12,
                      marginTop: 8,
                      fontSize: 12,
                      color: "var(--text-muted)",
                    }}
                  >
                    <button
                      onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                      disabled={auditPage <= 1}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "4px 8px",
                        borderRadius: 6,
                        border: "1px solid var(--panel-border)",
                        background: "var(--input-bg)",
                        color: "var(--foreground)",
                        cursor: auditPage <= 1 ? "not-allowed" : "pointer",
                        opacity: auditPage <= 1 ? 0.4 : 1,
                      }}
                    >
                      <ChevronLeft size={13} /> Prev
                    </button>
                    <span>Page {auditPage}</span>
                    <button
                      onClick={() => setAuditPage((p) => p + 1)}
                      disabled={auditLogs.length < 15}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "4px 8px",
                        borderRadius: 6,
                        border: "1px solid var(--panel-border)",
                        background: "var(--input-bg)",
                        color: "var(--foreground)",
                        cursor: auditLogs.length < 15 ? "not-allowed" : "pointer",
                        opacity: auditLogs.length < 15 ? 0.4 : 1,
                      }}
                    >
                      Next <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--panel-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 12,
            background: "var(--input-bg)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              border: "1px solid var(--panel-border)",
              background: "var(--panel-bg)",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          {activeTab === "config" && (
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={saving}
              style={{
                padding: "8px 20px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                border: "none",
                background: "var(--brand-gradient)",
                color: "#fff",
                cursor: saving ? "wait" : "pointer",
                opacity: saving ? 0.7 : 1,
                boxShadow: "0 2px 4px rgba(99, 102, 241, 0.2)",
              }}
            >
              {saving ? "Saving..." : "Save Configuration"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
