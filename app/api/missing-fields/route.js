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
    const keyEnvironment = searchParams.get("keyEnvironment") || "";
    const bugStatus = searchParams.get("bugStatus") || "";
    const issueType = searchParams.get("issueType") || "";
    const page = Number(searchParams.get("page")) || 1;
    const pageSize = Number(searchParams.get("pageSize")) || 50;

    const { rows, total } = await getDocumentsWithMissingFields({
      search,
      docType,
      showAll,
      clientId,
      businessName,
      status,
      keyEnvironment,
      bugStatus,
      issueType,
      page,
      pageSize,
    });

    return NextResponse.json(
      { documents: rows, total, page, pageSize },
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
