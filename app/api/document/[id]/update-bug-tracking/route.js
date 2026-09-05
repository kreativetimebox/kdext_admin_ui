import { NextResponse } from "next/server";
import { updateBugTracking } from "@/lib/queries";
import { ISSUE_TYPES, BUG_STATUSES, ACTION_STATUSES } from "@/lib/constants";
import { assertOwnsDocument } from "@/lib/clientAccess";
import { dexaiQuery } from "@/lib/dexaidb";
import { triggerBugNotificationSafe } from "@/lib/bugNotificationService";

export async function POST(req, { params }) {
  try {
    const { id } = await params;

    const ownershipError = await assertOwnsDocument(req, id);
    if (ownershipError) return ownershipError;

    const body = await req.json();
    const { issueType, issueDescription, bugStatus, actionStatus } = body || {};

    if (issueType !== undefined && issueType !== null && !ISSUE_TYPES.includes(issueType)) {
      return NextResponse.json({ ok: false, error: "Invalid issue type" }, { status: 400 });
    }

    if (bugStatus !== undefined && bugStatus !== null && !BUG_STATUSES.includes(bugStatus)) {
      return NextResponse.json({ ok: false, error: "Invalid bug status" }, { status: 400 });
    }

    if (actionStatus !== undefined && actionStatus !== null && !ACTION_STATUSES.includes(actionStatus)) {
      return NextResponse.json({ ok: false, error: "Invalid action status" }, { status: 400 });
    }

    // Retrieve previous state for change comparison
    const existingQuery = await dexaiQuery(
      `SELECT bug_tracker_id, result_id, request_id, bug_status, action_status, issue_type, issue_description
       FROM document_processing_requests
       WHERE (result_id = $1 OR request_id = $1) AND is_deleted = false
       LIMIT 1`,
      [id]
    );
    const existing = existingQuery.rows[0];

    const updated = await updateBugTracking(id, { issueType, issueDescription, bugStatus, actionStatus });
    if (!updated) {
      return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
    }

    const changedBy = req.headers.get("x-user-email") || "Admin";
    const bId = existing?.bug_tracker_id || updated?.bug_tracker_id;
    const rId = updated?.result_id || id;
    const reqId = updated?.request_id || existing?.request_id;

    // Trigger notifications asynchronously (non-blocking)
    if (bId) {
      if (bugStatus !== undefined && bugStatus !== existing?.bug_status) {
        triggerBugNotificationSafe({
          bugTrackerId: bId,
          resultId: rId,
          requestId: reqId,
          eventType: bugStatus === "Closed" ? "BUG_CLOSED" : "STATUS_CHANGED",
          fieldName: "Bug Status",
          previousValue: existing?.bug_status || "—",
          newValue: bugStatus || "—",
          changedBy,
        });
      }

      if (actionStatus !== undefined && actionStatus !== existing?.action_status) {
        triggerBugNotificationSafe({
          bugTrackerId: bId,
          resultId: rId,
          requestId: reqId,
          eventType: "ACTION_STATUS_CHANGED",
          fieldName: "Action Status",
          previousValue: existing?.action_status || "None",
          newValue: actionStatus || "None",
          changedBy,
        });
      }

      if ((issueType !== undefined && issueType !== existing?.issue_type) ||
          (issueDescription !== undefined && issueDescription !== existing?.issue_description)) {
        triggerBugNotificationSafe({
          bugTrackerId: bId,
          resultId: rId,
          requestId: reqId,
          eventType: "BUG_UPDATED",
          fieldName: "Bug Details",
          previousValue: existing?.issue_type || "—",
          newValue: issueType !== undefined ? issueType : existing?.issue_type,
          comments: issueDescription !== undefined ? issueDescription : existing?.issue_description,
          changedBy,
        });
      }
    }

    return NextResponse.json({ ok: true, ...updated }, { status: 200 });
  } catch (error) {
    console.error("POST /api/document/[id]/update-bug-tracking error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
  }
}
