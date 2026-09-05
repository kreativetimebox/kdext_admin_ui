import { NextResponse } from "next/server";
import { dexaiQuery } from "@/lib/dexaidb";
import { ensureBugNotificationTables } from "@/lib/bugNotificationService";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    await ensureBugNotificationTables();

    // Fetch global setting
    const globalRes = await dexaiQuery(
      `SELECT * FROM bug_notification_settings WHERE client_id IS NULL LIMIT 1`
    );

    // Fetch client-specific overrides
    const overridesRes = await dexaiQuery(
      `SELECT s.*, 
              u.email AS client_email, 
              COALESCE(NULLIF(BTRIM(u.company_name), ''), CONCAT(u.first_name, ' ', u.last_name)) AS client_name
       FROM bug_notification_settings s
       JOIN users u ON u.user_id = s.client_id
       WHERE s.client_id IS NOT NULL
       ORDER BY client_name ASC`
    );

    // Fetch list of all active clients for dropdown
    const clientsRes = await dexaiQuery(
      `SELECT user_id, 
              email, 
              COALESCE(NULLIF(BTRIM(company_name), ''), CONCAT(first_name, ' ', last_name), email) AS display_name
       FROM users
       WHERE is_deleted = false
       ORDER BY display_name ASC`
    );

    return NextResponse.json({
      ok: true,
      global: globalRes.rows[0] || null,
      clientOverrides: overridesRes.rows || [],
      clients: clientsRes.rows || [],
    });
  } catch (error) {
    console.error("GET /api/bug-tracker/notifications/settings error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    await ensureBugNotificationTables();
    const body = await req.json();

    const {
      clientId = null, // null = Global
      enabled = true,
      notifyBugCreated = true,
      notifyBugStatusChanged = true,
      notifyActionStatusChanged = true,
      notifyBugAssigned = true,
      notifyCommentAdded = true,
      notifyBugUpdated = true,
      notifyBugClosed = true,
      notifyDocumentUpdated = true,
      recipientBugOwner = true,
      recipientClientAdmin = true,
      recipientInternalTeam = false,
      customRecipients = [],
      cc = [],
      bcc = [],
      frequency = "immediate",
    } = body || {};

    const cleanCustom = Array.isArray(customRecipients)
      ? customRecipients.map((e) => String(e).trim()).filter((e) => e.includes("@"))
      : [];
    const cleanCC = Array.isArray(cc)
      ? cc.map((e) => String(e).trim()).filter((e) => e.includes("@"))
      : [];
    const cleanBCC = Array.isArray(bcc)
      ? bcc.map((e) => String(e).trim()).filter((e) => e.includes("@"))
      : [];

    let result;
    if (clientId) {
      // Upsert client-specific override
      result = await dexaiQuery(
        `INSERT INTO bug_notification_settings (
          client_id, enabled,
          notify_bug_created, notify_bug_status_changed, notify_action_status_changed,
          notify_bug_assigned, notify_comment_added, notify_bug_updated,
          notify_bug_closed, notify_document_updated,
          recipient_bug_owner, recipient_client_admin, recipient_internal_team,
          custom_recipients, cc, bcc, frequency, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, CURRENT_TIMESTAMP
        )
        ON CONFLICT (client_id)
        DO UPDATE SET
          enabled = EXCLUDED.enabled,
          notify_bug_created = EXCLUDED.notify_bug_created,
          notify_bug_status_changed = EXCLUDED.notify_bug_status_changed,
          notify_action_status_changed = EXCLUDED.notify_action_status_changed,
          notify_bug_assigned = EXCLUDED.notify_bug_assigned,
          notify_comment_added = EXCLUDED.notify_comment_added,
          notify_bug_updated = EXCLUDED.notify_bug_updated,
          notify_bug_closed = EXCLUDED.notify_bug_closed,
          notify_document_updated = EXCLUDED.notify_document_updated,
          recipient_bug_owner = EXCLUDED.recipient_bug_owner,
          recipient_client_admin = EXCLUDED.recipient_client_admin,
          recipient_internal_team = EXCLUDED.recipient_internal_team,
          custom_recipients = EXCLUDED.custom_recipients,
          cc = EXCLUDED.cc,
          bcc = EXCLUDED.bcc,
          frequency = EXCLUDED.frequency,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *`,
        [
          Number(clientId),
          Boolean(enabled),
          Boolean(notifyBugCreated),
          Boolean(notifyBugStatusChanged),
          Boolean(notifyActionStatusChanged),
          Boolean(notifyBugAssigned),
          Boolean(notifyCommentAdded),
          Boolean(notifyBugUpdated),
          Boolean(notifyBugClosed),
          Boolean(notifyDocumentUpdated),
          Boolean(recipientBugOwner),
          Boolean(recipientClientAdmin),
          Boolean(recipientInternalTeam),
          cleanCustom,
          cleanCC,
          cleanBCC,
          frequency,
        ]
      );
    } else {
      // Upsert global setting
      result = await dexaiQuery(
        `INSERT INTO bug_notification_settings (
          client_id, enabled,
          notify_bug_created, notify_bug_status_changed, notify_action_status_changed,
          notify_bug_assigned, notify_comment_added, notify_bug_updated,
          notify_bug_closed, notify_document_updated,
          recipient_bug_owner, recipient_client_admin, recipient_internal_team,
          custom_recipients, cc, bcc, frequency, updated_at
        ) VALUES (
          NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP
        )
        ON CONFLICT ((client_id IS NULL)) WHERE client_id IS NULL
        DO UPDATE SET
          enabled = EXCLUDED.enabled,
          notify_bug_created = EXCLUDED.notify_bug_created,
          notify_bug_status_changed = EXCLUDED.notify_bug_status_changed,
          notify_action_status_changed = EXCLUDED.notify_action_status_changed,
          notify_bug_assigned = EXCLUDED.notify_bug_assigned,
          notify_comment_added = EXCLUDED.notify_comment_added,
          notify_bug_updated = EXCLUDED.notify_bug_updated,
          notify_bug_closed = EXCLUDED.notify_bug_closed,
          notify_document_updated = EXCLUDED.notify_document_updated,
          recipient_bug_owner = EXCLUDED.recipient_bug_owner,
          recipient_client_admin = EXCLUDED.recipient_client_admin,
          recipient_internal_team = EXCLUDED.recipient_internal_team,
          custom_recipients = EXCLUDED.custom_recipients,
          cc = EXCLUDED.cc,
          bcc = EXCLUDED.bcc,
          frequency = EXCLUDED.frequency,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *`,
        [
          Boolean(enabled),
          Boolean(notifyBugCreated),
          Boolean(notifyBugStatusChanged),
          Boolean(notifyActionStatusChanged),
          Boolean(notifyBugAssigned),
          Boolean(notifyCommentAdded),
          Boolean(notifyBugUpdated),
          Boolean(notifyBugClosed),
          Boolean(notifyDocumentUpdated),
          Boolean(recipientBugOwner),
          Boolean(recipientClientAdmin),
          Boolean(recipientInternalTeam),
          cleanCustom,
          cleanCC,
          cleanBCC,
          frequency,
        ]
      );
    }

    return NextResponse.json({ ok: true, settings: result.rows[0] });
  } catch (error) {
    console.error("POST /api/bug-tracker/notifications/settings error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
