import { NextResponse } from "next/server";
import { sendEmail, isEmailConfigured } from "@/lib/emailTransporter";
import { dexaiQuery } from "@/lib/dexaidb";
import { ensureBugNotificationTables } from "@/lib/bugNotificationService";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const body = await req.json();
    const { email } = body || {};

    if (!email || !String(email).includes("@")) {
      return NextResponse.json({ ok: false, error: "Valid recipient email is required" }, { status: 400 });
    }

    const testEmail = String(email).trim();
    const subject = "[Bug Tracker] Test Notification – TechDexAI Bug Tracker";
    const timestamp = new Date().toLocaleString();

    const textBody = `Hello,

This is a test notification from the TechDexAI Bug Tracker.
Your email notification service is properly reaching this inbox.

Sent At: ${timestamp}
Recipient: ${testEmail}

Regards,
TechDexAI Bug Tracker`;

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; background: #f8fafc; padding: 24px; color: #1e293b;">
  <div style="max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    <div style="padding: 20px 24px; background: linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%); color: #ffffff;">
      <h2 style="margin: 0; font-size: 18px;">TechDexAI Bug Tracker</h2>
      <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Test Email Delivery</p>
    </div>
    <div style="padding: 24px;">
      <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.5; color: #334155;">
        Hello,<br><br>
        This is a test notification from the TechDexAI Bug Tracker.
        Your email notification service is active and properly reaching this inbox!
      </p>
      <div style="background: #f1f5f9; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #475569;">
        <strong>Recipient:</strong> ${testEmail}<br>
        <strong>Sent At:</strong> ${timestamp}
      </div>
    </div>
    <div style="padding: 16px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
      TechDexAI Automated Notification System
    </div>
  </div>
</body>
</html>`;

    const sendRes = await sendEmail({
      to: [testEmail],
      subject,
      text: textBody,
      html: htmlBody,
    });

    await ensureBugNotificationTables();
    await dexaiQuery(
      `INSERT INTO bug_notification_logs (
        event_type, changed_by, email_subject, email_body,
        recipients, email_status, error_message, sent_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        "TEST_NOTIFICATION",
        req.headers.get("x-user-email") || "Admin",
        subject,
        textBody,
        JSON.stringify({ to: [testEmail] }),
        sendRes.success ? "SENT" : sendRes.simulated ? "NO_SMTP_CONFIG" : "FAILED",
        sendRes.error || null,
        sendRes.success ? new Date().toISOString() : null,
      ]
    );

    if (sendRes.success) {
      return NextResponse.json({ ok: true, message: "Test email delivered successfully!" });
    }

    if (sendRes.simulated) {
      return NextResponse.json({
        ok: false,
        warning: true,
        error: "SMTP credentials (SMTP_HOST, SMTP_USER, SMTP_PASS) are not yet set in .env. The notification was simulated and logged in the audit history.",
      });
    }

    return NextResponse.json({ ok: false, error: sendRes.error || "Failed to send test email" }, { status: 500 });
  } catch (error) {
    console.error("POST /api/bug-tracker/notifications/test error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
