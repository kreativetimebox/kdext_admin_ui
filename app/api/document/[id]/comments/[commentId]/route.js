import { NextResponse } from "next/server";
import { getComment, updateComment, deleteComment } from "@/lib/queries";
import { assertOwnsDocument } from "@/lib/clientAccess";

// x-user-email is set by middleware.js from the verified JWT, so it can't be
// spoofed by the request body -- only the original author of a comment may
// edit or delete it.
async function assertOwnComment(req, id, commentId) {
  const existing = await getComment(id, commentId);
  if (!existing) {
    return { error: NextResponse.json({ ok: false, error: "Comment not found" }, { status: 404 }) };
  }
  const requester = (req.headers.get("x-user-email") || "").toLowerCase();
  if ((existing.username || "").toLowerCase() !== requester) {
    return { error: NextResponse.json({ ok: false, error: "You can only edit or delete your own comments" }, { status: 403 }) };
  }
  return { existing };
}

export async function PUT(req, { params }) {
  try {
    const { id, commentId } = await params;
    const numericCommentId = Number(commentId);

    const ownershipError = await assertOwnsDocument(req, id);
    if (ownershipError) return ownershipError;

    const body = await req.json();
    const message = (body?.message || "").trim();

    if (!message) {
      return NextResponse.json({ ok: false, error: "Comment message is required" }, { status: 400 });
    }

    const { error } = await assertOwnComment(req, id, numericCommentId);
    if (error) return error;

    const comments = await updateComment(id, numericCommentId, message);
    if (comments === null) {
      return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, comments }, { status: 200 });
  } catch (error) {
    console.error("PUT /api/document/[id]/comments/[commentId] error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const { id, commentId } = await params;
    const numericCommentId = Number(commentId);

    const ownershipError = await assertOwnsDocument(req, id);
    if (ownershipError) return ownershipError;

    const { error } = await assertOwnComment(req, id, numericCommentId);
    if (error) return error;

    const comments = await deleteComment(id, numericCommentId);
    if (comments === null) {
      return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, comments }, { status: 200 });
  } catch (error) {
    console.error("DELETE /api/document/[id]/comments/[commentId] error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
  }
}
