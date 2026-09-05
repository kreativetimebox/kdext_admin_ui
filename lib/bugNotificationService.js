import { dexaiQuery } from "./dexaidb.js";
import { sendEmail } from "./emailTransporter.js";

// Cache schema check so we don't query information_schema repeatedly
let tablesInitialized = false;

/**
 * Initializes bug notification tables safely without affecting any existing tables.
 */
export async function ensureBugNotificationTables() {
  if (tablesInitialized) return;

  try {
    await dexaiQuery(`
      CREATE TABLE IF NOT EXISTS bug_notification_settings (
        id SERIAL PRIMARY KEY,
        client_id INT,
        enabled BOOLEAN NOT NULL DEFAULT true,
        notify_bug_created BOOLEAN NOT NULL DEFAULT true,
        notify_bug_status_changed BOOLEAN NOT NULL DEFAULT true,
        notify_action_status_changed BOOLEAN NOT NULL DEFAULT true,
        notify_bug_assigned BOOLEAN NOT NULL DEFAULT true,
        notify_comment_added BOOLEAN NOT NULL DEFAULT true,
        notify_bug_updated BOOLEAN NOT NULL DEFAULT true,
        notify_bug_closed BOOLEAN NOT NULL DEFAULT true,
        notify_document_updated BOOLEAN NOT NULL DEFAULT true,
        recipient_bug_owner BOOLEAN NOT NULL DEFAULT true,
        recipient_client_admin BOOLEAN NOT NULL DEFAULT true,
        recipient_internal_team BOOLEAN NOT NULL DEFAULT false,
        custom_recipients TEXT[] DEFAULT '{}',
        cc TEXT[] DEFAULT '{}',
        bcc TEXT[] DEFAULT '{}',
        frequency VARCHAR(32) NOT NULL DEFAULT 'immediate',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_bug_notif_settings_global 
        ON bug_notification_settings ((client_id IS NULL)) 
        WHERE client_id IS NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_bug_notif_settings_client 
        ON bug_notification_settings (client_id) 
        WHERE client_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS bug_notification_logs (
        id SERIAL PRIMARY KEY,
        bug_tracker_id INT,
        result_id VARCHAR(128),
        request_id VARCHAR(128),
        client_id INT,
        client_email VARCHAR(255),
        client_name VARCHAR(255),
        event_type VARCHAR(64) NOT NULL,
        changed_by VARCHAR(255),
        changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        field_name VARCHAR(64),
        previous_value TEXT,
        new_value TEXT,
        recipients JSONB,
        email_subject TEXT,
        email_body TEXT,
        email_status VARCHAR(32) NOT NULL,
        error_message TEXT,
        sent_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_bug_notif_logs_bug_id 
        ON bug_notification_logs (bug_tracker_id);

      CREATE INDEX IF NOT EXISTS idx_bug_notif_logs_created_at 
        ON bug_notification_logs (created_at DESC);

      CREATE TABLE IF NOT EXISTS bug_notification_overrides (
        bug_tracker_id INT PRIMARY KEY,
        is_muted BOOLEAN NOT NULL DEFAULT false,
        updated_by VARCHAR(255),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Ensure default global configuration exists
      INSERT INTO bug_notification_settings (
        client_id, enabled,
        notify_bug_created, notify_bug_status_changed, notify_action_status_changed,
        notify_bug_assigned, notify_comment_added, notify_bug_updated,
        notify_bug_closed, notify_document_updated,
        recipient_bug_owner, recipient_client_admin, recipient_internal_team,
        custom_recipients, cc, bcc, frequency
      )
      SELECT
        NULL, true,
        true, true, true,
        true, true, true,
        true, true,
        true, true, false,
        '{}'::text[], '{}'::text[], '{}'::text[], 'immediate'
      WHERE NOT EXISTS (
        SELECT 1 FROM bug_notification_settings WHERE client_id IS NULL
      );
    `);

    tablesInitialized = true;
  } catch (err) {
    console.error("[bugNotificationService] Failed to ensure tables:", err.message);
  }
}

/**
 * In-memory de-duplication cache to prevent duplicate emails from accidental double-clicks.
 * Key: `${bugTrackerId}_${eventType}_${newValue}` -> timestamp
 */
const recentDispatches = new Map();
const DEDUPE_WINDOW_MS = 5000;

function isDuplicateDispatch(key) {
  const now = Date.now();
  const last = recentDispatches.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) {
    return true;
  }
  recentDispatches.set(key, now);

  // Clean old entries periodically
  if (recentDispatches.size > 200) {
    for (const [k, ts] of recentDispatches.entries()) {
      if (now - ts > DEDUPE_WINDOW_MS) {
        recentDispatches.delete(k);
      }
    }
  }
  return false;
}

/**
 * Format a bug_tracker_id into BUG-01186 format.
 */
export function formatBugId(id) {
  if (id == null) return "BUG-UNKNOWN";
  return `BUG-${String(id).padStart(5, "0")}`;
}

/**
 * Get notification settings for a specific client (or global default if no override exists).
 */
export async function getEffectiveSettings(clientId = null) {
  await ensureBugNotificationTables();

  let clientRow = null;
  if (clientId) {
    const res = await dexaiQuery(
      `SELECT * FROM bug_notification_settings WHERE client_id = $1 LIMIT 1`,
      [clientId]
    );
    clientRow = res.rows[0];
  }

  if (clientRow) {
    return { ...clientRow, isOverride: true };
  }

  const globalRes = await dexaiQuery(
    `SELECT * FROM bug_notification_settings WHERE client_id IS NULL LIMIT 1`
  );
  return { ...(globalRes.rows[0] || {}), isOverride: false };
}

/**
 * Check if a specific bug ticket is muted.
 */
export async function isBugMuted(bugTrackerId) {
  if (!bugTrackerId) return false;
  await ensureBugNotificationTables();
  const res = await dexaiQuery(
    `SELECT is_muted FROM bug_notification_overrides WHERE bug_tracker_id = $1 LIMIT 1`,
    [bugTrackerId]
  );
  return Boolean(res.rows[0]?.is_muted);
}

/**
 * Toggle mute status for a single bug ticket.
 */
export async function setBugMuted(bugTrackerId, isMuted, updatedBy = "admin") {
  if (!bugTrackerId) return;
  await ensureBugNotificationTables();
  await dexaiQuery(
    `INSERT INTO bug_notification_overrides (bug_tracker_id, is_muted, updated_by, updated_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (bug_tracker_id)
     DO UPDATE SET is_muted = EXCLUDED.is_muted, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP`,
    [bugTrackerId, Boolean(isMuted), updatedBy]
  );
}

/**
 * Query all muted bug IDs.
 */
export async function getMutedBugIds() {
  await ensureBugNotificationTables();
  const res = await dexaiQuery(
    `SELECT bug_tracker_id FROM bug_notification_overrides WHERE is_muted = true`
  );
  return new Set(res.rows.map((r) => r.bug_tracker_id));
}

/**
 * Generates subject line based on event type.
 */
function buildSubject({ eventType, bugIdText, newValue }) {
  switch (eventType) {
    case "BUG_CREATED":
      return `[Bug Tracker] New Bug Created – ${bugIdText}`;
    case "STATUS_CHANGED":
      return `[Bug Tracker] ${bugIdText} – Status Changed to ${newValue || "Updated"}`;
    case "ASSIGNED":
      return `[Bug Tracker] ${bugIdText} Assigned to ${newValue || "Team Member"}`;
    case "COMMENT_ADDED":
      return `[Bug Tracker] New Comment Added – ${bugIdText}`;
    case "ACTION_STATUS_CHANGED":
      return `[Bug Tracker] ${bugIdText} – Action Status Updated`;
    case "BUG_CLOSED":
      return `[Bug Tracker] ${bugIdText} Updated – Status Changed to Closed`;
    case "DOCUMENT_UPDATED":
      return `[Bug Tracker] ${bugIdText} – Associated Document Updated`;
    case "BUG_UPDATED":
    default:
      return `[Bug Tracker] ${bugIdText} – Ticket Updated`;
  }
}

/**
 * Generates clean plain-text body matching requirements.
 */
function buildPlainTextBody({
  bugIdText,
  resultId,
  clientName,
  docType,
  bugStatus,
  actionStatus,
  fieldName,
  previousValue,
  newValue,
  changedBy,
  changedAtFormatted,
  comments,
  viewUrl,
}) {
  return `Hello Team,

A bug ticket has been updated in the TechDexAI Bug Tracker.

Bug ID        : ${bugIdText}
Result ID     : ${resultId || "—"}
Client        : ${clientName || "—"}
Document Type : ${docType || "—"}
Bug Status    : ${bugStatus || "—"}
Action Status : ${actionStatus || "None"}

Change Details
------------------------------------------------
Field         : ${fieldName || "Bug Ticket"}
Previous      : ${previousValue || "—"}
Updated To    : ${newValue || "—"}

Updated By    : ${changedBy || "System"}
Updated At    : ${changedAtFormatted}
------------------------------------------------
${comments ? `\nComments:\n${comments}\n` : ""}
View Bug:
${viewUrl}

Regards,
TechDexAI Bug Tracker`;
}

/**
 * Generates responsive, visually stunning HTML body.
 */
function buildHtmlBody({
  bugIdText,
  resultId,
  clientName,
  docType,
  bugStatus,
  actionStatus,
  fieldName,
  previousValue,
  newValue,
  changedBy,
  changedAtFormatted,
  comments,
  viewUrl,
}) {
  const statusColor =
    String(bugStatus).toUpperCase() === "CLOSED"
      ? "#22c55e"
      : String(bugStatus).toUpperCase().includes("TEST")
      ? "#f97316"
      : "#ef4444";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${bugIdText} Notification</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 600px; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);" cellspacing="0" cellpadding="0">
          <!-- Header -->
          <tr>
            <td style="padding: 24px 32px; background: linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%); color: #ffffff;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">TechDexAI Bug Tracker</h1>
              <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">Notification Alert for ${bugIdText}</p>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.5; color: #475569;">
                Hello Team,<br><br>
                A bug ticket has been updated in the TechDexAI Bug Tracker.
              </p>

              <!-- Ticket Info Box -->
              <table role="presentation" width="100%" style="background-color: #f1f5f9; border-radius: 8px; padding: 16px; margin-bottom: 24px; font-size: 13px;" cellspacing="0" cellpadding="4">
                <tr>
                  <td width="130" style="color: #64748b; font-weight: 600;">Bug ID</td>
                  <td style="font-family: monospace; font-weight: 700; color: #0f172a;">${bugIdText}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; font-weight: 600;">Result ID</td>
                  <td style="font-family: monospace; color: #0284c7; font-weight: 600;">${resultId || "—"}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; font-weight: 600;">Client</td>
                  <td style="font-weight: 600; color: #0f172a;">${clientName || "—"}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; font-weight: 600;">Document Type</td>
                  <td style="color: #475569;">${docType || "—"}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; font-weight: 600;">Bug Status</td>
                  <td>
                    <span style="display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 700; background-color: ${statusColor}1a; color: ${statusColor};">
                      ${bugStatus || "—"}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="color: #64748b; font-weight: 600;">Action Status</td>
                  <td style="color: #475569;">${actionStatus || "None"}</td>
                </tr>
              </table>

              <!-- Change Details Section -->
              <div style="border-left: 3px solid #6366f1; padding-left: 16px; margin-bottom: 24px;">
                <h3 style="margin: 0 0 12px; font-size: 14px; font-weight: 700; color: #0f172a;">Change Details</h3>
                <table role="presentation" width="100%" style="font-size: 13px;" cellspacing="0" cellpadding="4">
                  <tr>
                    <td width="110" style="color: #64748b;">Field:</td>
                    <td style="font-weight: 600; color: #0f172a;">${fieldName || "Bug Ticket"}</td>
                  </tr>
                  <tr>
                    <td style="color: #64748b;">Previous:</td>
                    <td style="color: #64748b; text-decoration: line-through;">${previousValue || "—"}</td>
                  </tr>
                  <tr>
                    <td style="color: #64748b;">Updated To:</td>
                    <td style="font-weight: 700; color: #16a34a;">${newValue || "—"}</td>
                  </tr>
                  <tr>
                    <td style="color: #64748b;">Updated By:</td>
                    <td style="color: #334155;">${changedBy || "System"}</td>
                  </tr>
                  <tr>
                    <td style="color: #64748b;">Updated At:</td>
                    <td style="color: #334155;">${changedAtFormatted}</td>
                  </tr>
                </table>
              </div>

              ${
                comments
                  ? `
              <div style="background: #fafafa; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 24px;">
                <span style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">Comments</span>
                <p style="margin: 6px 0 0; font-size: 13px; color: #1e293b; line-height: 1.5; white-space: pre-wrap;">${comments}</p>
              </div>`
                  : ""
              }

              <!-- Button CTA -->
              <div style="text-align: center; margin: 32px 0 16px;">
                <a href="${viewUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%); color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 8px; box-shadow: 0 2px 4px rgba(99, 102, 241, 0.2);">
                  View Bug Ticket &rarr;
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
              This is an automated notification from TechDexAI Bug Tracker.<br>
              You are receiving this because your email is configured as a notification recipient.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Main dispatcher to process and trigger bug notification.
 * Never throws an unhandled exception to the caller.
 *
 * @param {object} params
 * @param {number|string} params.bugTrackerId
 * @param {string} params.resultId
 * @param {string} params.requestId
 * @param {string} params.eventType - 'BUG_CREATED' | 'STATUS_CHANGED' | 'ACTION_STATUS_CHANGED' | 'ASSIGNED' | 'COMMENT_ADDED' | 'BUG_UPDATED' | 'BUG_CLOSED' | 'DOCUMENT_UPDATED'
 * @param {string} [params.fieldName]
 * @param {string} [params.previousValue]
 * @param {string} [params.newValue]
 * @param {string} [params.changedBy]
 * @param {string} [params.comments]
 */
export async function triggerBugNotificationSafe(params) {
  try {
    const {
      bugTrackerId,
      resultId,
      requestId,
      eventType,
      fieldName = "",
      previousValue = "",
      newValue = "",
      changedBy = "System",
      comments = "",
    } = params;

    if (!eventType) return;

    // Fast de-duplication check (e.g. rapid double clicks)
    const dedupeKey = `${bugTrackerId || resultId}_${eventType}_${newValue || ""}`;
    if (isDuplicateDispatch(dedupeKey)) {
      console.log(`[bugNotificationService] Skipping duplicate event within ${DEDUPE_WINDOW_MS}ms: ${dedupeKey}`);
      return;
    }

    await ensureBugNotificationTables();

    // Look up document and client details
    const docQuery = await dexaiQuery(
      `SELECT
         d.bug_tracker_id,
         d.result_id,
         d.request_id,
         d.user_id,
         d.bug_status,
         d.action_status,
         d.hitl_assigned_to,
         COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) AS ocr_document_type,
         u.email AS client_email,
         NULLIF(BTRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), '') AS client_name,
         u.company_name,
         hiu.email AS assignee_email,
         NULLIF(BTRIM(CONCAT(hiu.first_name, ' ', hiu.last_name)), '') AS assignee_name
       FROM document_processing_requests d
       LEFT JOIN document_types dt ON dt.document_type_id = d.document_type_id
       LEFT JOIN users u ON u.user_id = d.user_id
       LEFT JOIN internal_users hiu ON hiu.internal_user_id::text = d.hitl_assigned_to
       WHERE (d.bug_tracker_id = $1 OR d.result_id = $2 OR d.request_id = $2)
         AND d.is_deleted = false
       LIMIT 1`,
      [bugTrackerId || -1, resultId || requestId || ""]
    );

    const doc = docQuery.rows[0];
    const effectiveBugId = doc?.bug_tracker_id || bugTrackerId;
    const effectiveResultId = doc?.result_id || resultId;
    const effectiveRequestId = doc?.request_id || requestId;
    const clientId = doc?.user_id || null;
    const clientEmail = doc?.client_email || null;
    const clientName = doc?.company_name || doc?.client_name || "Client";
    const docType = doc?.ocr_document_type || "Document";
    const currentBugStatus = doc?.bug_status || "Open";
    const currentActionStatus = doc?.action_status || "None";
    const assigneeEmail = doc?.assignee_email || null;

    // Check if this specific bug is muted
    if (effectiveBugId && (await isBugMuted(effectiveBugId))) {
      console.log(`[bugNotificationService] Bug ${effectiveBugId} is muted; skipping email.`);
      await recordAuditLog({
        bugTrackerId: effectiveBugId,
        resultId: effectiveResultId,
        requestId: effectiveRequestId,
        clientId,
        clientEmail,
        clientName,
        eventType,
        changedBy,
        fieldName,
        previousValue,
        newValue,
        recipients: { to: [], cc: [], bcc: [] },
        emailSubject: `Muted (${eventType})`,
        emailBody: "Bug notification is explicitly muted for this ticket.",
        emailStatus: "MUTED",
      });
      return;
    }

    // Get effective notification settings (client override or global)
    const settings = await getEffectiveSettings(clientId);

    if (!settings.enabled) {
      console.log(`[bugNotificationService] Notifications are disabled in settings (client_id: ${clientId || "global"}).`);
      await recordAuditLog({
        bugTrackerId: effectiveBugId,
        resultId: effectiveResultId,
        requestId: effectiveRequestId,
        clientId,
        clientEmail,
        clientName,
        eventType,
        changedBy,
        fieldName,
        previousValue,
        newValue,
        recipients: { to: [], cc: [], bcc: [] },
        emailSubject: `Disabled (${eventType})`,
        emailBody: "Notifications are disabled in settings.",
        emailStatus: "DISABLED",
      });
      return;
    }

    // Check if the specific event trigger is enabled
    const eventFlagMap = {
      BUG_CREATED: settings.notify_bug_created,
      STATUS_CHANGED: settings.notify_bug_status_changed,
      ACTION_STATUS_CHANGED: settings.notify_action_status_changed,
      ASSIGNED: settings.notify_bug_assigned,
      COMMENT_ADDED: settings.notify_comment_added,
      BUG_UPDATED: settings.notify_bug_updated,
      BUG_CLOSED: settings.notify_bug_closed,
      DOCUMENT_UPDATED: settings.notify_document_updated,
    };

    const isTriggerEnabled = eventFlagMap[eventType] !== false;
    if (!isTriggerEnabled) {
      console.log(`[bugNotificationService] Trigger ${eventType} is turned OFF in settings.`);
      await recordAuditLog({
        bugTrackerId: effectiveBugId,
        resultId: effectiveResultId,
        requestId: effectiveRequestId,
        clientId,
        clientEmail,
        clientName,
        eventType,
        changedBy,
        fieldName,
        previousValue,
        newValue,
        recipients: { to: [], cc: [], bcc: [] },
        emailSubject: `Trigger Disabled (${eventType})`,
        emailBody: `Event trigger ${eventType} is disabled in notification settings.`,
        emailStatus: "TRIGGER_DISABLED",
      });
      return;
    }

    // Resolve Recipients
    const toRecipients = new Set();

    // 1. Bug Owner (assignee)
    if (settings.recipient_bug_owner && assigneeEmail) {
      toRecipients.add(assigneeEmail.trim().toLowerCase());
    }

    // 2. Client Admin
    if (settings.recipient_client_admin && clientEmail) {
      toRecipients.add(clientEmail.trim().toLowerCase());
    }

    // 3. Custom Recipients
    if (Array.isArray(settings.custom_recipients)) {
      for (const email of settings.custom_recipients) {
        if (email && typeof email === "string" && email.includes("@")) {
          toRecipients.add(email.trim().toLowerCase());
        }
      }
    }

    // 4. Internal Team (if enabled, fetch internal user emails with team roles)
    if (settings.recipient_internal_team) {
      const teamQuery = await dexaiQuery(
        `SELECT email FROM internal_users WHERE is_active = true AND client_id IS NULL`
      );
      for (const row of teamQuery.rows) {
        if (row.email && row.email.includes("@")) {
          toRecipients.add(row.email.trim().toLowerCase());
        }
      }
    }

    const toList = Array.from(toRecipients);
    const ccList = (Array.isArray(settings.cc) ? settings.cc : []).filter(Boolean);
    const bccList = (Array.isArray(settings.bcc) ? settings.bcc : []).filter(Boolean);

    const recipientsPayload = {
      to: toList,
      cc: ccList,
      bcc: bccList,
    };

    if (toList.length === 0 && ccList.length === 0 && bccList.length === 0) {
      console.warn(`[bugNotificationService] No recipients found for ${eventType} on bug ${effectiveBugId}.`);
      await recordAuditLog({
        bugTrackerId: effectiveBugId,
        resultId: effectiveResultId,
        requestId: effectiveRequestId,
        clientId,
        clientEmail,
        clientName,
        eventType,
        changedBy,
        fieldName,
        previousValue,
        newValue,
        recipients: recipientsPayload,
        emailSubject: `No Recipients (${eventType})`,
        emailBody: "No recipients configured or matched for this event.",
        emailStatus: "NO_RECIPIENTS",
      });
      return;
    }

    const bugIdText = formatBugId(effectiveBugId);
    const subject = buildSubject({ eventType, bugIdText, newValue });
    const changedAtFormatted = new Date().toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const hostBase =
      process.env.NEXT_PUBLIC_SERVER_URL ||
      (process.env.HOSTNAME ? `http://${process.env.HOSTNAME}:${process.env.PORT || 3004}` : "http://localhost:3004");

    const viewUrl = `${hostBase}/bug-tracker?search=${encodeURIComponent(bugIdText)}`;

    const textBody = buildPlainTextBody({
      bugIdText,
      resultId: effectiveResultId,
      clientName,
      docType,
      bugStatus: currentBugStatus,
      actionStatus: currentActionStatus,
      fieldName,
      previousValue,
      newValue,
      changedBy,
      changedAtFormatted,
      comments,
      viewUrl,
    });

    const htmlBody = buildHtmlBody({
      bugIdText,
      resultId: effectiveResultId,
      clientName,
      docType,
      bugStatus: currentBugStatus,
      actionStatus: currentActionStatus,
      fieldName,
      previousValue,
      newValue,
      changedBy,
      changedAtFormatted,
      comments,
      viewUrl,
    });

    // Send email safely
    const sendResult = await sendEmail({
      to: toList,
      cc: ccList,
      bcc: bccList,
      subject,
      text: textBody,
      html: htmlBody,
    });

    const emailStatus = sendResult.success
      ? "SENT"
      : sendResult.simulated
      ? "NO_SMTP_CONFIG"
      : "FAILED";

    await recordAuditLog({
      bugTrackerId: effectiveBugId,
      resultId: effectiveResultId,
      requestId: effectiveRequestId,
      clientId,
      clientEmail,
      clientName,
      eventType,
      changedBy,
      fieldName,
      previousValue,
      newValue,
      recipients: recipientsPayload,
      emailSubject: subject,
      emailBody: textBody,
      emailStatus,
      errorMessage: sendResult.error || null,
      sentAt: sendResult.success ? new Date().toISOString() : null,
    });

    console.log(`[bugNotificationService] Notification for ${bugIdText} [${eventType}] status: ${emailStatus}`);
  } catch (err) {
    console.error("[bugNotificationService] Unexpected error in triggerBugNotificationSafe:", err);
  }
}

/**
 * Record an entry into the audit log table.
 */
async function recordAuditLog({
  bugTrackerId,
  resultId,
  requestId,
  clientId,
  clientEmail,
  clientName,
  eventType,
  changedBy,
  fieldName,
  previousValue,
  newValue,
  recipients,
  emailSubject,
  emailBody,
  emailStatus,
  errorMessage = null,
  sentAt = null,
}) {
  try {
    await dexaiQuery(
      `INSERT INTO bug_notification_logs (
        bug_tracker_id, result_id, request_id, client_id, client_email, client_name,
        event_type, changed_by, field_name, previous_value, new_value,
        recipients, email_subject, email_body, email_status, error_message, sent_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        bugTrackerId || null,
        resultId || null,
        requestId || null,
        clientId || null,
        clientEmail || null,
        clientName || null,
        eventType,
        changedBy || "System",
        fieldName || null,
        previousValue || null,
        newValue || null,
        JSON.stringify(recipients || {}),
        emailSubject || "",
        emailBody || "",
        emailStatus || "UNKNOWN",
        errorMessage || null,
        sentAt || (emailStatus === "SENT" ? new Date().toISOString() : null),
      ]
    );
  } catch (err) {
    console.error("[bugNotificationService] Failed to record audit log:", err.message);
  }
}

/**
 * Fetch paginated audit logs for UI.
 */
export async function getNotificationLogs({
  bugTrackerId = null,
  eventType = null,
  status = null,
  search = "",
  page = 1,
  pageSize = 50,
} = {}) {
  await ensureBugNotificationTables();

  const where = [];
  const params = [];

  if (bugTrackerId) {
    params.push(bugTrackerId);
    where.push(`bug_tracker_id = $${params.length}`);
  }

  if (eventType) {
    params.push(eventType);
    where.push(`event_type = $${params.length}`);
  }

  if (status) {
    params.push(status);
    where.push(`email_status = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    const p = `$${params.length}`;
    where.push(`(
      result_id ILIKE ${p} OR
      request_id ILIKE ${p} OR
      client_email ILIKE ${p} OR
      changed_by ILIKE ${p} OR
      email_subject ILIKE ${p}
    )`);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const safePageSize = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safePageSize;

  params.push(safePageSize, offset);
  const limitClause = `LIMIT $${params.length - 1} OFFSET $${params.length}`;

  const countRes = await dexaiQuery(
    `SELECT COUNT(*) AS total FROM bug_notification_logs ${whereClause}`,
    params.slice(0, params.length - 2)
  );
  const total = Number(countRes.rows[0]?.total || 0);

  const logsRes = await dexaiQuery(
    `SELECT * FROM bug_notification_logs ${whereClause} ORDER BY created_at DESC ${limitClause}`,
    params
  );

  return {
    logs: logsRes.rows,
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.ceil(total / safePageSize) || 1,
  };
}
