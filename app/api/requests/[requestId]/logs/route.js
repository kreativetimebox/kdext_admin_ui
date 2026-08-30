import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { canViewRequestLogs } from "@/lib/requestLogsAccess";
import { dexaiQuery } from "@/lib/dexaidb";

export async function GET(req, { params }) {
  try {
    const user = await verifyAuthToken(req);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (!canViewRequestLogs(user)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Access denied. Only Superadmins and authorized personnel (surya@dexai.app, adil@dexai.app, subham@dexai.app) can view request logs.",
        },
        { status: 403 }
      );
    }

    const { requestId } = await params;
    if (!requestId) {
      return NextResponse.json(
        { ok: false, error: "Request ID is required" },
        { status: 400 }
      );
    }

    const targetId = decodeURIComponent(requestId).trim();

    // Look up document info by request_id or result_id
    const docResult = await dexaiQuery(
      `SELECT
         d.request_id,
         d.result_id,
         d.transaction_id,
         COALESCE(NULLIF(BTRIM(d.ocr_document_type), ''), dt.type_name) AS document_type,
         d.status,
         d.original_filename,
         d.document_path,
         d.file_size_bytes,
         d.processing_duration_ms,
         d.error_message,
         d.submitted_at,
         d.completed_at,
         d.created_at
       FROM document_processing_requests d
       LEFT JOIN document_types dt ON dt.document_type_id = d.document_type_id
       WHERE d.request_id = $1 OR d.result_id = $1
       LIMIT 1`,
      [targetId]
    );

    const docRow = docResult.rows[0] || null;
    const resolvedRequestId = docRow?.request_id || targetId;

    // Fetch chronological logs for this request
    const logsResult = await dexaiQuery(
      `SELECT
         log_id,
         request_id,
         stage,
         level,
         message,
         details,
         created_at
       FROM document_processing_logs
       WHERE request_id = $1
       ORDER BY created_at ASC, log_id ASC`,
      [resolvedRequestId]
    );

    let filename = docRow?.original_filename;
    if (!filename && docRow?.document_path) {
      try {
        const rawName = docRow.document_path.split("/").pop().split("?")[0];
        filename = decodeURIComponent(rawName);
      } catch {
        filename = docRow.document_path;
      }
    }
    if (!filename) {
      filename = docRow?.result_id || resolvedRequestId;
    }

    return NextResponse.json({
      ok: true,
      requestId: resolvedRequestId,
      resultId: docRow?.result_id || null,
      filename,
      documentType: docRow?.document_type || null,
      status: docRow?.status || (logsResult.rows.length ? "COMPLETED" : "UNKNOWN"),
      processingDurationMs: docRow?.processing_duration_ms || null,
      submittedAt: docRow?.submitted_at || docRow?.created_at || null,
      completedAt: docRow?.completed_at || null,
      logs: logsResult.rows,
    });
  } catch (error) {
    console.error("GET /api/requests/[requestId]/logs error:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch request logs" },
      { status: 500 }
    );
  }
}
