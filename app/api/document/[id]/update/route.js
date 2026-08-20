import { NextResponse } from "next/server";
import { updateHitlResult } from "@/lib/queries";
import { sendDocumentCorrectedNotification } from "@/lib/webhooks";
import { assertOwnsDocument } from "@/lib/clientAccess";

const AUDIT_LIMIT = 50;

export async function POST(request, { params }) {
  try {
    const { id } = await params;

    const ownershipError = await assertOwnsDocument(request, id);
    if (ownershipError) return ownershipError;

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

    // The editable fields (and our meta) live at the top level, or under a
    // wrapper key when the pipeline wraps them. Edits are saved to the
    // hitl_updated_result column; formatted_result stays immutable.
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

    const updated = await updateHitlResult(id, result);

    if (!updated) {
      return NextResponse.json(
        { error: "Document not found or update failed" },
        { status: 404 }
      );
    }

    // Notify the customer's registered webhook that the document was corrected.
    // Fetches the active webhook URL & secret from the database, signs with HMAC-SHA256,
    // dispatches HTTP POST, and logs the delivery attempt in webhook_deliveries.
    let notifications = [];
    if (updated.request_id && updated.user_id != null) {
      try {
        notifications = await sendDocumentCorrectedNotification({
          documentId: updated.request_id,
          userId: updated.user_id,
          resultId: updated.id,
          documentType: updated.ocr_document_type,
          clientDocumentType: updated.client_document_type,
          keyEnvironment: updated.key_environment,
          version: updated.result_version,
        });
      } catch (pubErr) {
        console.error(
          "[webhooks] Failed to send document.corrected notification:",
          pubErr?.message || pubErr
        );
      }
    }

    return NextResponse.json(
      {
        success: true,
        id: updated.id,
        hitl_updated_result: updated.hitl_results,
        notifications,
      },
      { status: 200 }
    );

  } catch (error) {
    console.error("POST /api/document/[id]/update error:", error);
    return NextResponse.json({ error: "Failed to save document" }, { status: 500 });
  }
}
