import { NextResponse } from "next/server";
import { dexaiQuery } from "@/lib/dexaidb";
import { assertOwnsDocument } from "@/lib/clientAccess";

const ALLOWED_EMAILS = ["financeai@financeai.com", "rashika@financeai.com"];

function canAssignHitl(email = "") {
  return ALLOWED_EMAILS.includes(email.toLowerCase());
}

export async function POST(req, { params }) {
  try {
    const callerEmail = req.headers.get("x-user-email") || "";
    if (!canAssignHitl(callerEmail)) {
      return NextResponse.json({ ok: false, error: "Not authorized to assign HITL" }, { status: 403 });
    }

    const { id } = await params;

    const ownershipError = await assertOwnsDocument(req, id);
    if (ownershipError) return ownershipError;

    const { hitlUserId } = await req.json();

    const assignee = hitlUserId || null;
    const newStatus = assignee ? "PENDING" : null;
    const result = await dexaiQuery(
      `UPDATE document_processing_requests
       SET hitl_assigned_to = $1,
           hitl_status = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE (result_id = $3 OR request_id = $3)
       RETURNING COALESCE(result_id, request_id) AS result_id`,
      [assignee, newStatus, id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ ok: false, error: `No document found with ID: ${id}` }, { status: 404 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("POST /api/document/[id]/assign-hitl error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
