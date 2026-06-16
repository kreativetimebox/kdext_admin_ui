import { NextResponse } from "next/server";
import { updateUiResults } from "@/lib/queries";

const AUDIT_LIMIT = 50;

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    // Contract: { result, changes }. Fall back to treating the whole body as
    // the result so older callers keep working.
    const result =
      body.result && typeof body.result === "object" ? body.result : body;
    const changes = Array.isArray(body.changes) ? body.changes : [];

    // Identify the editor from the verified-JWT headers the middleware sets —
    // this can't be spoofed by the client payload.
    const email = request.headers.get("x-user-email") || null;
    const userId = request.headers.get("x-user-id") || null;
    let roles = [];
    try {
      roles = JSON.parse(request.headers.get("x-user-roles") || "[]");
    } catch {
      roles = [];
    }

    // The editable fields (and our meta) live at the top level, or under
    // formatted_result when the pipeline wraps them.
    const inner =
      result.formatted_result &&
      typeof result.formatted_result === "object" &&
      !Array.isArray(result.formatted_result)
        ? result.formatted_result
        : result;

    const entry = {
      at: new Date().toISOString(),
      by: email,
      by_id: userId,
      roles,
      fields: changes,
    };
    const existing = Array.isArray(inner._audit) ? inner._audit : [];
    inner._audit = [...existing, entry].slice(-AUDIT_LIMIT);

    const updated = await updateUiResults(id, result);

    if (!updated) {
      return NextResponse.json(
        { error: "Document not found or update failed" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      // The DB column is formatted_result; expose it as ocr_ui_results so the
      // frontend reads the saved data (incl. the appended audit) back.
      { success: true, id: updated.id, ocr_ui_results: updated.ocr_results },
      { status: 200 }
    );
  } catch (error) {
    console.error("POST /api/document/[id]/update error:", error);
    return NextResponse.json({ error: "Failed to save document" }, { status: 500 });
  }
}
