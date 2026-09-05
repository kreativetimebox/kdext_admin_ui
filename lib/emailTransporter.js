import nodemailer from "nodemailer";

/**
 * Returns true if SMTP environment variables are configured.
 */
export function isEmailConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    (process.env.SMTP_PASS || process.env.SMTP_PASSWORD)
  );
}

/**
 * Creates and caches a Nodemailer SMTP transporter.
 */
let cachedTransporter = null;

export function getEmailTransporter() {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  if (!host || !user || !pass) {
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    // Prevent hanging sockets in serverless / container runtimes
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  return cachedTransporter;
}

/**
 * Default "from" email header.
 */
export function getDefaultFromEmail() {
  return (
    process.env.SMTP_FROM ||
    (process.env.SMTP_USER ? `TechDexAI Bug Tracker <${process.env.SMTP_USER}>` : "TechDexAI Bug Tracker <notifications@techdexai.com>")
  );
}

/**
 * Sends an email using Nodemailer.
 * Returns { success: boolean, messageId?: string, error?: string, simulated?: boolean }
 */
export async function sendEmail({ to, cc, bcc, subject, text, html, from }) {
  const toList = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  const ccList = Array.isArray(cc) ? cc.filter(Boolean) : (cc ? [cc] : []);
  const bccList = Array.isArray(bcc) ? bcc.filter(Boolean) : (bcc ? [bcc] : []);

  if (toList.length === 0 && ccList.length === 0 && bccList.length === 0) {
    return {
      success: false,
      error: "No recipients specified",
      simulated: false,
    };
  }

  const transporter = getEmailTransporter();
  if (!transporter) {
    console.warn("[emailTransporter] SMTP not configured. Notification was logged but not sent via email.");
    return {
      success: false,
      error: "SMTP not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in server environment.",
      simulated: true,
    };
  }

  try {
    const info = await transporter.sendMail({
      from: from || getDefaultFromEmail(),
      to: toList.join(", "),
      cc: ccList.length > 0 ? ccList.join(", ") : undefined,
      bcc: bccList.length > 0 ? bccList.join(", ") : undefined,
      subject,
      text,
      html,
    });

    return {
      success: true,
      messageId: info.messageId,
      response: info.response,
    };
  } catch (err) {
    console.error("[emailTransporter] sendMail failed:", err.message);
    return {
      success: false,
      error: err.message || "Failed to send email",
    };
  }
}
