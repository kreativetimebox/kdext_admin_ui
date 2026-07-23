import { NextResponse } from "next/server";
import { getDocumentById } from "@/lib/queries";
import { getSignedFileUrl } from "@/lib/aws";
import { assertOwnsDocument } from "@/lib/clientAccess";

export async function GET(request, { params }) {
  try {
    const { id } = await params;

    const ownershipError = await assertOwnsDocument(request, id);
    if (ownershipError) return ownershipError;

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
        request_id: doc.request_id,
        ocr_document_type: doc.ocr_document_type,
        source_file: doc.source_file,
        signed_url: signedUrl,
        // Whether a HITL reviewer has validated/published edits. The viewer uses
        // this to decide whether the "HITL Updated Result" panel shows the saved
        // result or falls back to the original extraction. Must be returned or
        // the panel always renders the original.
        validation: doc.validation === true,
        status: doc.status,
        hitl_status: doc.hitl_status,
        issue_type: doc.issue_type ?? null,
        issue_description: doc.issue_description ?? null,
        bug_status: doc.bug_status ?? null,
        comments: doc.comments ?? [],
        key_environment: doc.key_environment,
        // formatted_result is the original (immutable) extraction, mapped onto
        // the names the frontend already speaks — shown in the "Original Result"
        // tab.
        ocr_results: doc.ocr_results ?? {},
        ocr_ui_results: doc.ocr_results ?? {},
        // hitl_updated_result is the human-corrected copy — the editable
        // "HITL Updated" tab. Null when it has never been edited (start empty).
        // Was checking doc.status (the raw pipeline status, always COMPLETED
        // after a successful reprocess commit) instead of doc.hitl_status
        // (which commitReprocessedResult sets to TO_BE_TESTED for both the
        // missing-fields and hitl_check=1 cases) — that typo meant a freshly
        // reprocessed row with real issues never got seeded, leaving the tab
        // empty and uneditable.
        hitl_updated_result: doc.hitl_status === 'TO_BE_TESTED' && !doc.hitl_updated_result ? doc.ocr_results : doc.hitl_updated_result ?? null,
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
