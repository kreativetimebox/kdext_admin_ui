import { getDocumentsWithMissingFieldsForExport } from "@/lib/queries";
import { rowsToCsv } from "@/lib/csv";

const COLUMNS = [
  { key: "result_id", label: "Result ID" },
  { key: "request_id", label: "Request ID" },
  { key: "transaction_id", label: "Transaction ID" },
  { key: "ocr_document_type", label: "Document Type" },
  { key: "key_environment", label: "Key Environment" },
  { key: "hitl_status", label: "HITL Status" },
  { key: "missing_count", label: "Missing Field Count" },
  { key: "client_name", label: "Client Name" },
  { key: "client_email", label: "Client Email" },
  { key: "business_name", label: "Business" },
  { key: "issue_type", label: "Issue Type" },
  { key: "issue_description", label: "Issue Description" },
  { key: "bug_status", label: "Bug Status" },
  { key: "formatted_result", label: "Formatted Result" },
  { key: "hitl_updated_result", label: "HITL Updated Result" },
  { key: "created_at", label: "Created At" },
];

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const showAll = searchParams.get("showAll") === "true";
    const search = searchParams.get("search") || "";
    const docType = searchParams.get("docType") || "";
    const clientId = searchParams.get("clientId") || "";
    const businessName = searchParams.get("businessName") || "";
    const status = searchParams.get("status") || "";
    const keyEnvironment = searchParams.get("keyEnvironment") || "";
    const bugStatus = searchParams.get("bugStatus") || "";
    const issueType = searchParams.get("issueType") || "";

    const rows = await getDocumentsWithMissingFieldsForExport({
      search,
      docType,
      showAll,
      clientId,
      businessName,
      status,
      keyEnvironment,
      bugStatus,
      issueType,
    });

    const csv = rowsToCsv(rows, COLUMNS);
    const filename = `hitl-edit-${Date.now()}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("GET /api/missing-fields/export error:", error);
    return new Response("Failed to export documents", { status: 500 });
  }
}
