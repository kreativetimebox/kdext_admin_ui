// lib/mailer.js
//
// Sends alert emails via SMTP for the background alert monitor (lib/alertMonitor.js).
// Kept separate from that module so the transport/credentials concern doesn't mix
// with detection logic.

import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const ALERT_EMAIL_FROM = process.env.ALERT_EMAIL_FROM || SMTP_USER;
const ALERT_EMAIL_TO = (process.env.ALERT_EMAIL_TO || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

/**
 * Send an alert email. Best-effort: logs and returns false instead of
 * throwing, so a mail-server hiccup never takes down the poll loop.
 */
export async function sendAlertEmail({ subject, text }) {
  const t = getTransporter();
  if (!t || ALERT_EMAIL_TO.length === 0) {
    console.warn(
      "[alert-monitor] SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS/ALERT_EMAIL_TO) — skipping email:",
      subject
    );
    return false;
  }
  try {
    await t.sendMail({
      from: ALERT_EMAIL_FROM,
      to: ALERT_EMAIL_TO.join(","),
      subject,
      text,
    });
    return true;
  } catch (err) {
    console.error("[alert-monitor] Failed to send alert email:", err.message);
    return false;
  }
}
