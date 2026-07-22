import { NextResponse } from "next/server";
import { addComment } from "@/lib/queries";

export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const message = (body?.message || "").trim();

    if (!message) {
      return NextResponse.json({ ok: false, error: "Comment message is required" }, { status: 400 });
    }

    // x-user-email is set by middleware.js from the verified JWT, so the
    // posted username can't be spoofed via the request body -- same trust
    // model as the audit log in app/api/document/[id]/update/route.js.
    const username = req.headers.get("x-user-email") || "Unknown user";

    const comments = await addComment(id, { username, message });
    if (comments === null) {
      return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, comments }, { status: 200 });
  } catch (error) {
    console.error("POST /api/document/[id]/comments error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
  }
}
