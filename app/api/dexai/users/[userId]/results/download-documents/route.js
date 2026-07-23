import { Readable } from "node:stream";
import { getDexaiUserResultsForExport } from "@/lib/dexai";
import { buildDocumentsZip } from "@/lib/documentZip";
import { getRequesterClientScope } from "@/lib/clientAccess";

// Downloading real files (not CSV rows) means an S3 fetch per document, so
// this is capped far below the CSV export's 20000-row cap to keep the
// request fast and the zip a reasonable size.
const DOWNLOAD_CAP = 100;

export async function GET(req, { params }) {
  try {
    const { userId } = await params;
    const id = Number(userId);
    if (!Number.isFinite(id)) {
      return new Response("Invalid user id", { status: 400 });
    }

    // CLIENT_ADMIN/CLIENT_USER can only ever download their own client's documents.
    const { isClientRole, clientId } = getRequesterClientScope(req);
    if (isClientRole && id !== clientId) {
      return new Response("Forbidden", { status: 403 });
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
      limit: DOWNLOAD_CAP,
    });

    const files = rows.map((r) => ({ name: r.result_id || r.request_id, documentPath: r.document_path }));
    const archive = buildDocumentsZip(files);
    const filename = `business-user-${id}-documents-${Date.now()}.zip`;

    return new Response(Readable.toWeb(archive), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("GET /api/dexai/users/[userId]/results/download-documents error:", error);
    return new Response("Failed to build document zip", { status: 500 });
  }
}
