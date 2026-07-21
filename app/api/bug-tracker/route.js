import { NextResponse } from "next/server";
import { getBugTrackerRows } from "@/lib/bugTracker";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    // Comma-separated (not repeated query params / axios [] notation) so the
    // frontend can build the URL with a plain string, no custom serializer.
    const companies = (searchParams.get("companies") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const docType = searchParams.get("docType") || "";
    const issueType = searchParams.get("issueType") || "";
    const bugStatus = searchParams.get("bugStatus") || "";
    const sortBy = searchParams.get("sortBy") || "";
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const page = Number(searchParams.get("page")) || 1;
    const pageSize = Number(searchParams.get("pageSize")) || 50;

    const { rows, total } = await getBugTrackerRows({
      search,
      companies,
      docType,
      issueType,
      bugStatus,
      sortBy,
      sortOrder,
      page,
      pageSize,
    });

    return NextResponse.json({ documents: rows, total, page, pageSize }, { status: 200 });
  } catch (error) {
    console.error("GET /api/bug-tracker error:", error);
    return NextResponse.json(
      { error: "Failed to fetch bug tracker documents", documents: [] },
      { status: 200 }
    );
  }
}
