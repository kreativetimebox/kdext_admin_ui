import { NextResponse } from "next/server";
import { getBugTrackerRows } from "@/lib/bugTracker";
import { getRequesterClientScope } from "@/lib/clientAccess";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    // Comma-separated (not repeated query params / axios [] notation) so the
    // frontend can build the URL with a plain string, no custom serializer.
    const clientEmails = (searchParams.get("clientEmails") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const docType = searchParams.get("docType") || "";
    const issueType = searchParams.get("issueType") || "";
    const bugStatus = searchParams.get("bugStatus") || "";
    const actionStatus = searchParams.get("actionStatus") || "";
    const sortBy = searchParams.get("sortBy") || "";
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const page = Number(searchParams.get("page")) || 1;
    const pageSize = Number(searchParams.get("pageSize")) || 50;

    // CLIENT_ADMIN/CLIENT_USER can only ever see their own client's rows —
    // forced from the verified JWT-derived header, never a client-supplied
    // param, regardless of what (if anything) the request asked for.
    const { isClientRole, clientId } = getRequesterClientScope(req);
    if (isClientRole && !clientId) {
      return NextResponse.json({ documents: [], total: 0, page, pageSize }, { status: 200 });
    }

    const { rows, total } = await getBugTrackerRows({
      search,
      clientEmails: isClientRole ? [] : clientEmails,
      docType,
      issueType,
      bugStatus,
      actionStatus,
      clientId: isClientRole ? clientId : "",
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
