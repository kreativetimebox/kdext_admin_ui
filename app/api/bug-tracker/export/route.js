import { getBugTrackerRowsForExport } from "@/lib/bugTracker";
import { rowsToCsv } from "@/lib/csv";
import { getRequesterClientScope } from "@/lib/clientAccess";

const COLUMNS = [
  { key: "bug_tracker_id", label: "Bug ID" },
  { key: "business_name", label: "Company" },
  { key: "client_email", label: "User Email" },
  { key: "request_id", label: "Request ID" },
  { key: "result_id", label: "Result ID" },
  { key: "transaction_id", label: "Transaction ID" },
  { key: "ocr_document_type", label: "Document Type" },
  { key: "bug_status", label: "Bug Status" },
  { key: "issue_type", label: "Issue Type" },
  { key: "issue_description", label: "Issue Description" },
  { key: "hitl_assigned_to", label: "HITL Assigned" },
  { key: "bug_flagged_at", label: "Bug Added" },
  { key: "created_at", label: "Created At" },
];

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const clientEmails = (searchParams.get("clientEmails") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const docType = searchParams.get("docType") || "";
    const issueType = searchParams.get("issueType") || "";
    const bugStatus = searchParams.get("bugStatus") || "";
    const sortBy = searchParams.get("sortBy") || "";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    const { isClientRole, clientId } = getRequesterClientScope(req);
    if (isClientRole && !clientId) {
      return new Response(rowsToCsv([], COLUMNS), { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8" } });
    }

    const rows = await getBugTrackerRowsForExport({
      search,
      clientEmails: isClientRole ? [] : clientEmails,
      docType,
      issueType,
      bugStatus,
      clientId: isClientRole ? clientId : "",
      sortBy,
      sortOrder,
    });

    const csv = rowsToCsv(rows, COLUMNS);
    const filename = `bug-tracker-${Date.now()}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("GET /api/bug-tracker/export error:", error);
    return new Response("Failed to export bug tracker documents", { status: 500 });
  }
}
