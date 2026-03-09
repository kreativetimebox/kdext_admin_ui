import { NextResponse } from "next/server";
import { getDocumentsWithMissingFields } from "@/lib/queries";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const docType = searchParams.get("docType") || "";
    const environment = searchParams.get("environment") || "";
    const showAll = searchParams.get("showAll") === "true";

    const documents = await getDocumentsWithMissingFields({ search, docType, environment, showAll });
    return NextResponse.json({ documents }, { status: 200 });
  } catch (error) {
    console.error("GET /api/missing-fields error:", error);
    return NextResponse.json(
      { error: "Failed to fetch documents with missing fields" },
      { status: 500 }
    );
  }
}
