import { NextResponse } from "next/server";
import { getDexaiUserResults } from "@/lib/dexai";
import { getRequesterClientScope } from "@/lib/clientAccess";

export async function GET(request, { params }) {
  try {
    const { userId } = await params;
    const id = Number(userId);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    // CLIENT_ADMIN/CLIENT_USER can only ever view their own client's results.
    const { isClientRole, clientId } = getRequesterClientScope(request);
    if (isClientRole && id !== clientId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const docType = searchParams.get("docType") || "";
    const status = searchParams.get("status") || "";
    const keyEnvironment = searchParams.get("keyEnvironment") || "";
    const bugStatus = searchParams.get("bugStatus") || "";
    const issueType = searchParams.get("issueType") || "";
    const sortBy = searchParams.get("sortBy") || "";
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const page = Number(searchParams.get("page")) || 1;
    const pageSize = Number(searchParams.get("pageSize")) || 50;

    const { rows, total } = await getDexaiUserResults(id, { search, docType, status, keyEnvironment, bugStatus, issueType, sortBy, sortOrder, page, pageSize });
    return NextResponse.json({ records: rows, total, page, pageSize }, { status: 200 });
  } catch (error) {
    console.error("GET /api/dexai/users/[userId]/results error:", error);
    return NextResponse.json(
      { error: "Failed to fetch user results" },
      { status: 500 }
    );
  }
}
