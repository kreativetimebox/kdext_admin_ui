import { Readable } from "node:stream";
import { getBugTrackerRowsForExport } from "@/lib/bugTracker";
import { buildDocumentsZip } from "@/lib/documentZip";

// Downloading real files (not CSV rows) means an S3 fetch per document, so
// this is capped far below the CSV export's 20000-row cap to keep the
// request fast and the zip a reasonable size.
const DOWNLOAD_CAP = 100;

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
      limit: DOWNLOAD_CAP,
    });

    const files = rows.map((r) => ({ name: r.result_id || r.request_id, documentPath: r.document_path }));
    const archive = buildDocumentsZip(files);
    const filename = `bug-tracker-documents-${Date.now()}.zip`;

    return new Response(Readable.toWeb(archive), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("GET /api/bug-tracker/download-documents error:", error);
    return new Response("Failed to build document zip", { status: 500 });
  }
}
