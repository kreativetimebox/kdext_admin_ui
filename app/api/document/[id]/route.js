import { NextResponse } from "next/server";
import { getDocumentById } from "@/lib/queries";
import { getSignedFileUrl } from "@/lib/aws";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const doc = await getDocumentById(id);

    if (!doc) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    // Generate S3 signed URL server-side — credentials never leave the server
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
        textract_results: doc.textract_results ?? {},
        ocr_results: doc.ocr_results ?? {},
        textract_raw_results: doc.textract_raw_results ?? {},
        ocr_raw_results: doc.ocr_results ?? {}, // ocr_raw_results maps to ocr_results column
        ocr_ui_results: doc.ocr_ui_results ?? {},
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
