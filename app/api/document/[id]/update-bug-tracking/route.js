import { NextResponse } from "next/server";
import { updateBugTracking } from "@/lib/queries";
import { ISSUE_TYPES, BUG_STATUSES } from "@/lib/constants";
import { assertOwnsDocument } from "@/lib/clientAccess";

export async function POST(req, { params }) {
  try {
    const { id } = await params;

    const ownershipError = await assertOwnsDocument(req, id);
    if (ownershipError) return ownershipError;

    const body = await req.json();
    const { issueType, issueDescription, bugStatus } = body || {};

    if (issueType !== undefined && issueType !== null && !ISSUE_TYPES.includes(issueType)) {
      return NextResponse.json({ ok: false, error: "Invalid issue type" }, { status: 400 });
    }

    if (bugStatus !== undefined && !BUG_STATUSES.includes(bugStatus)) {
      return NextResponse.json({ ok: false, error: "Invalid bug status" }, { status: 400 });
    }

    const updated = await updateBugTracking(id, { issueType, issueDescription, bugStatus });
    if (!updated) {
      return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, ...updated }, { status: 200 });
  } catch (error) {
    console.error("POST /api/document/[id]/update-bug-tracking error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
  }
}
