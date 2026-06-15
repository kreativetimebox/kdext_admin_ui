import { NextResponse } from "next/server";
import { getDocumentsWithMissingFields } from "@/lib/queries";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const showAll = searchParams.get("showAll") === "true";
    const search = searchParams.get("search") || "";
    const docType = searchParams.get("docType") || "";

    // Missing-field detection runs entirely in SQL against the main finance DB,
    // derived from the document_processing_requests.formatted_result JSON per
    // document type (see lib/queries.js). No dependency on a mandatory_fields
    // column, which does not exist on the main DB's document_types table.
    const documents = await getDocumentsWithMissingFields({ search, docType, showAll });

    return NextResponse.json(
      { documents, total: documents.length },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/missing-fields error:", error);
    return NextResponse.json(
      { error: "Failed to fetch documents", documents: [] },
      { status: 200 }
    );
  }
}
