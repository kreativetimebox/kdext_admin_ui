import { NextResponse } from "next/server";
import {
  getReprocessTarget,
  getRequestStatus,
  commitReprocessedResult,
} from "@/lib/queries";
import { getSignedFileUrl } from "@/lib/aws";
import { submitReprocess } from "@/lib/ocrClient";

// Document types the reprocess dropdown may submit. Mirrors the API's
// _VALID_DOCUMENT_TYPES so we reject anything unexpected before hitting the DB.
const VALID_DOCUMENT_TYPES = new Set([
  "InvoicePDF",
  "InvoiceImage",
  "ReceiptPDF",
  "ReceiptImage",
  "BankStatementPDF",
]);

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED"]);

/**
 * POST /api/document/[id]/reprocess
 * Start a reprocess: presign the document's source file and submit it to the
 * external /process-document endpoint. Returns the transient request_id the
 * client then polls (GET) and commits (PUT). The ORIGINAL request_id is left
 * untouched — this only overwrites its result once processing completes.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const { documentType } = await request.json().catch(() => ({}));

    if (!VALID_DOCUMENT_TYPES.has(documentType)) {
      return NextResponse.json(
        { error: "Invalid or missing documentType" },
        { status: 400 }
      );
    }

    const doc = await getReprocessTarget(id);
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    if (!doc.source_file) {
      return NextResponse.json(
        { error: "Document has no source file to reprocess" },
        { status: 400 }
      );
    }

    // The OCR API downloads the URL itself; a presigned URL is downloadable
    // over plain HTTP regardless of which bucket the object lives in.
    const signedUrl = await getSignedFileUrl(doc.source_file);
    if (!signedUrl) {
      return NextResponse.json(
        { error: "Source file is unavailable in storage" },
        { status: 409 }
      );
    }

    const result = await submitReprocess({ s3Url: signedUrl, documentType });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.message || "Failed to start reprocessing" },
        { status: result.httpStatus >= 400 ? result.httpStatus : 502 }
      );
    }

    return NextResponse.json(
      {
        old_request_id: doc.request_id,
        new_request_id: result.newRequestId,
        document_type: documentType,
        status: "PENDING",
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("POST /api/document/[id]/reprocess error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to start reprocessing" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/document/[id]/reprocess?newRequestId=...
 * Poll the transient reprocess request's status.
 */
export async function GET(request) {
  try {
    const newRequestId = request.nextUrl.searchParams.get("newRequestId");
    if (!newRequestId) {
      return NextResponse.json(
        { error: "newRequestId is required" },
        { status: 400 }
      );
    }

    const row = await getRequestStatus(newRequestId);
    if (!row) {
      // Row not visible yet — treat as still pending rather than an error.
      return NextResponse.json({ status: "PENDING", done: false }, { status: 200 });
    }

    const status = row.status || "PENDING";
    return NextResponse.json(
      {
        status,
        done: TERMINAL_STATUSES.has(status),
        has_result: !!row.has_result,
        error_message: row.error_message || null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/document/[id]/reprocess error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to poll reprocessing status" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/document/[id]/reprocess
 * Commit a completed reprocess: copy the new result onto the original document
 * row (keeping its request_id) and retire the transient request.
 * Body: { newRequestId, documentType }
 */
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const { newRequestId, documentType } = await request.json().catch(() => ({}));

    if (!newRequestId) {
      return NextResponse.json(
        { error: "newRequestId is required" },
        { status: 400 }
      );
    }
    if (!VALID_DOCUMENT_TYPES.has(documentType)) {
      return NextResponse.json(
        { error: "Invalid or missing documentType" },
        { status: 400 }
      );
    }

    const status = await getRequestStatus(newRequestId);
    if (!status) {
      return NextResponse.json(
        { error: "Reprocessing request not found" },
        { status: 404 }
      );
    }
    if (status.status !== "COMPLETED") {
      return NextResponse.json(
        {
          error:
            status.status === "FAILED"
              ? status.error_message || "Reprocessing failed"
              : "Reprocessing is not complete yet",
          status: status.status,
        },
        { status: 409 }
      );
    }

    const committed = await commitReprocessedResult({
      targetId: id,
      newRequestId,
      documentType,
    });
    if (!committed) {
      return NextResponse.json(
        { error: "Could not apply the reprocessed result" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        id: committed.id,
        request_id: committed.request_id,
        status: "COMPLETED",
        // hitl_status/validation of the just-committed result — lets the
        // caller decide whether this document still needs a human (see
        // lib/reprocessRunner.js's redirect-to-/view/[id] logic).
        hitl_status: committed.hitl_status,
        validation: committed.validation,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("PUT /api/document/[id]/reprocess error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to apply reprocessed result" },
      { status: 500 }
    );
  }
}
