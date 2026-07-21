import { getBugTrackerRowsForExport } from "@/lib/bugTracker";
import { rowsToCsv } from "@/lib/csv";

const COLUMNS = [
  { key: "business_name", label: "Company" },
  { key: "client_email", label: "User Email" },
  { key: "request_id", label: "Request ID" },
  { key: "result_id", label: "Result ID" },
  { key: "transaction_id", label: "Transaction ID" },
  { key: "ocr_document_type", label: "Document Type" },
  { key: "bug_status", label: "Bug Status" },
  { key: "issue_type", label: "Issue Type" },
  { key: "issue_description", label: "Issue Description" },
  { key: "created_at", label: "Created At" },
];

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const companies = (searchParams.get("companies") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const docType = searchParams.get("docType") || "";
    const issueType = searchParams.get("issueType") || "";
    const bugStatus = searchParams.get("bugStatus") || "";
    const sortBy = searchParams.get("sortBy") || "";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    const rows = await getBugTrackerRowsForExport({
      search,
      companies,
      docType,
      issueType,
      bugStatus,
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
