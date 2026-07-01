import { NextResponse } from "next/server";
import { getDocumentsWithMissingFields } from "@/lib/queries";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const showAll = searchParams.get("showAll") === "true";
    const search = searchParams.get("search") || "";
    const docType = searchParams.get("docType") || "";
    const clientId = searchParams.get("clientId") || "";
    const businessName = searchParams.get("businessName") || "";
    const status = searchParams.get("status") || "";

    const documents = await getDocumentsWithMissingFields({ search, docType, showAll, clientId, businessName, status });

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
