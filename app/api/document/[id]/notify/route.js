import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { dexaiQuery } from "@/lib/dexaidb";
import { sendDocumentCorrectedNotification } from "@/lib/webhooks";
import { assertOwnsDocument } from "@/lib/clientAccess";

export async function POST(request, { params }) {
  try {
    const { id } = await params;

    const ownershipError = await assertOwnsDocument(request, id);
    if (ownershipError) return ownershipError;

    // Fetch document details
    const docResult = await dexaiQuery(
      `SELECT
         request_id,
         result_id,
         user_id,
         ocr_document_type,
         client_document_type,
         key_environment,
         result_version
       FROM document_processing_requests
       WHERE (result_id = $1 OR request_id = $1)
         AND is_deleted = false
       LIMIT 1`,
      [id]
    );

    const doc = docResult.rows[0];
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const notifications = await sendDocumentCorrectedNotification({
      documentId: doc.request_id,
      userId: doc.user_id,
      resultId: doc.result_id,
      documentType: doc.ocr_document_type,
      clientDocumentType: doc.client_document_type,
      keyEnvironment: doc.key_environment,
      version: doc.result_version || 2,
    });

    return NextResponse.json(
      {
        success: true,
        documentId: doc.request_id,
        userId: doc.user_id,
        notifications,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("POST /api/document/[id]/notify error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send notification" },
      { status: 500 }
    );
  }
}
