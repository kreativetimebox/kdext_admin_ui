import { getDexaiUserResultsForExport } from "@/lib/dexai";
import { rowsToCsv } from "@/lib/csv";

const COLUMNS = [
  { key: "request_id", label: "Request ID" },
  { key: "result_id", label: "Result ID" },
  { key: "document_type", label: "Document Type" },
  { key: "key_environment", label: "Key Environment" },
  { key: "status", label: "Status" },
  { key: "issue_type", label: "Issue Type" },
  { key: "issue_description", label: "Issue Description" },
  { key: "bug_status", label: "Bug Status" },
  { key: "formatted_result", label: "Formatted Result" },
  { key: "hitl_updated_result", label: "HITL Updated Result" },
  { key: "created_at", label: "Created At" },
  { key: "updated_at", label: "Updated At" },
  { key: "processing_duration_ms", label: "Processing Duration (ms)" },
];

export async function GET(req, { params }) {
  try {
    const { userId } = await params;
    const id = Number(userId);
    if (!Number.isFinite(id)) {
      return new Response("Invalid user id", { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const docType = searchParams.get("docType") || "";
    const status = searchParams.get("status") || "";
    const keyEnvironment = searchParams.get("keyEnvironment") || "";
    const bugStatus = searchParams.get("bugStatus") || "";
    const issueType = searchParams.get("issueType") || "";
    const sortBy = searchParams.get("sortBy") || "";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    const rows = await getDexaiUserResultsForExport(id, {
      search,
      docType,
      status,
      keyEnvironment,
      bugStatus,
      issueType,
      sortBy,
      sortOrder,
    });

    const csv = rowsToCsv(rows, COLUMNS);
    const filename = `business-user-${id}-${Date.now()}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("GET /api/dexai/users/[userId]/results/export error:", error);
    return new Response("Failed to export results", { status: 500 });
  }
}
