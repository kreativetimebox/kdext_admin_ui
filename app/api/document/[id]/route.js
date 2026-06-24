import { NextResponse } from "next/server";
import { getDocumentById } from "@/lib/queries";
import { getSignedFileUrl } from "@/lib/aws";

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const doc = await getDocumentById(id);

    if (!doc) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    let signedUrl = null;
    if (doc.source_file) {
      try {
        signedUrl = await getSignedFileUrl(doc.source_file);
      } catch (err) {
        console.warn("Failed to generate signed URL:", err.message);
      }
    }

    return NextResponse.json(
      {
        id: doc.id,
        ocr_document_type: doc.ocr_document_type,
        source_file: doc.source_file,
        signed_url: signedUrl,
        // formatted_result is the original (immutable) extraction, mapped onto
        // the names the frontend already speaks — shown in the "Original Result"
        // tab.
        ocr_results: doc.ocr_results ?? {},
        ocr_ui_results: doc.ocr_results ?? {},
        // hitl_updated_result is the human-corrected copy — the editable
        // "HITL Updated" tab. Null when it has never been edited (start empty).
        hitl_updated_result: doc.hitl_updated_result ?? null,
        // processing_result is the raw worker payload — exposed as the "raw"
        // counterpart so existing viewers keep working.
        ocr_raw_results: doc.processing_result ?? {},
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/document/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch document" },
      { status: 500 }
    );
  }
}
