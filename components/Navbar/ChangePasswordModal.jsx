"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { X, Eye, EyeOff } from "lucide-react";

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

function PasswordField({ label, value, onChange, name }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: "relative" }}>
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="new-password"
          name={name}
          style={{ ...fieldStyle, paddingRight: 36 }}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          title={show ? "Hide password" : "Show password"}
          style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: "#6b7280", display: "flex", alignItems: "center" }}
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );
}

export default function ChangePasswordModal({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!currentPassword) {
      toast.error("Enter your current password");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords don't match");
      return;
    }

    setSaving(true);
    try {
      await axios.post("/api/auth/change-password", { currentPassword, newPassword });
      toast.success("Password changed");
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Failed to change password");
    } finally {
      setSaving(false);
    }
  }

  // Rendered via a portal straight into document.body — Navbar's <header>
  // has backdrop-filter, which (like `filter`/`transform`) creates a new
  // containing block for `position: fixed` descendants. Without the portal,
  // this modal's "fixed, full-viewport" box was actually being positioned
  // relative to the 58px-tall header instead of the screen, so it appeared
  // stuck at the top and clipped.
  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 400, maxWidth: "90vw", background: "#ffffff", borderRadius: 12, border: "1px solid #e5e7eb", boxShadow: "0 12px 40px rgba(0,0,0,0.25)", padding: 22 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#111827" }}>Change Password</h2>
          <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#6b7280" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <PasswordField label="Current Password" value={currentPassword} onChange={setCurrentPassword} name="current-password" />
          <PasswordField label="New Password" value={newPassword} onChange={setNewPassword} name="new-password" />
          <PasswordField label="Confirm New Password" value={confirmPassword} onChange={setConfirmPassword} name="confirm-password" />
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
    </div>,
    document.body
  );
}
