import { NextResponse } from "next/server";
import { dexaiQuery } from "@/lib/dexaidb";
import { assertOwnsDocument } from "@/lib/clientAccess";

const VALID_STATUSES = ["COMPLETED", "PENDING", "PROCESSING", "TO_BE_TESTED", "FAILED"];

export async function POST(req, { params }) {
  try {
    const { id } = await params;

    const ownershipError = await assertOwnsDocument(req, id);
    if (ownershipError) return ownershipError;

    const { status } = await req.json();

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ ok: false, error: "Invalid status value" }, { status: 400 });
    }

    await dexaiQuery(
      `UPDATE document_processing_requests
       SET hitl_status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE result_id = $2`,
      [status, id]
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("POST /api/document/[id]/update-status error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
  }
}
