import { NextResponse } from "next/server";
import { getDexaiResultByRequestId } from "@/lib/dexai";
import { getSignedFileUrl } from "@/lib/aws";

export async function GET(_request, { params }) {
  try {
    const { requestId } = await params;
    const row = await getDexaiResultByRequestId(requestId);

    if (!row) {
      return NextResponse.json(
        { error: "Result not found" },
        { status: 404 }
      );
    }

    let signedUrl = null;
    if (row.document_path) {
      try {
        signedUrl = await getSignedFileUrl(row.document_path);
      } catch (err) {
        console.warn(
          `Failed to sign URL for ${row.request_id}:`,
          err.message
        );
      }
    }

    return NextResponse.json(
      {
        request_id: row.request_id,
        result_id: row.result_id,
        user_id: row.user_id,
        transaction_id: row.transaction_id,
        document_path: row.document_path,
        original_filename: row.original_filename,
        file_size_bytes: row.file_size_bytes,
        file_hash: row.file_hash,
        document_type: row.document_type,
        status: row.status,
        error_message: row.error_message,
        error_code: row.error_code,
        processing_duration_ms: row.processing_duration_ms,
        submitted_at: row.submitted_at,
        queued_at: row.queued_at,
        started_at: row.started_at,
        completed_at: row.completed_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        signed_url: signedUrl,
        formatted_result: row.formatted_result ?? null,
        hitl_updated_result: row.hitl_updated_result ?? null,
        processing_result: row.processing_result ?? null,
        issue_type: row.issue_type ?? null,
        issue_description: row.issue_description ?? null,
        bug_status: row.bug_status ?? null,
        user: {
          user_id: row.user_id,
          email: row.user_email,
          first_name: row.user_first_name,
          last_name: row.user_last_name,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/dexai/result/[requestId] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch result" },
      { status: 500 }
    );
  }
}
