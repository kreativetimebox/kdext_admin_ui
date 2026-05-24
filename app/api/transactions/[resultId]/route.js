import { NextResponse } from "next/server";
import { getTransactionByResultId } from "@/lib/transactions";
import { getSignedFileUrl } from "@/lib/aws";

export async function GET(_request, { params }) {
  try {
    const { resultId } = await params;
    const row = await getTransactionByResultId(resultId);

    if (!row) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    let signedUrl = null;
    if (row.document_path) {
      try {
        signedUrl = await getSignedFileUrl(row.document_path);
      } catch (err) {
        console.warn(
          `Failed to sign URL for ${row.result_id}:`,
          err.message
        );
      }
    }

    return NextResponse.json(
      {
        result_id: row.result_id,
        request_id: row.request_id,
        transaction_id: row.transaction_id,
        document_path: row.document_path,
        original_filename: row.original_filename,
        document_type: row.document_type,
        status: row.status,
        submitted_at: row.submitted_at,
        completed_at: row.completed_at,
        processing_duration_ms: row.processing_duration_ms,
        error_message: row.error_message,
        error_code: row.error_code,
        signed_url: signedUrl,
        formatted_result: row.formatted_result ?? null,
        processing_result: row.processing_result ?? null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/transactions/[resultId] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch transaction" },
      { status: 500 }
    );
  }
}
