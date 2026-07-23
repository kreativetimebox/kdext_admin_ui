import { NextResponse } from "next/server";
import { getDocumentsWithMissingFields } from "@/lib/queries";
import { getRequesterClientScope } from "@/lib/clientAccess";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const showAll = searchParams.get("showAll") === "true";
    const search = searchParams.get("search") || "";
    const docType = searchParams.get("docType") || "";
    let clientId = searchParams.get("clientId") || "";
    let businessName = searchParams.get("businessName") || "";
    const status = searchParams.get("status") || "";
    const keyEnvironment = searchParams.get("keyEnvironment") || "";
    const bugStatus = searchParams.get("bugStatus") || "";
    const issueType = searchParams.get("issueType") || "";
    const hitlUserId = searchParams.get("hitlUserId") || "";
    const validation = searchParams.get("validation") || "";
    const sortBy = searchParams.get("sortBy") || "";
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const page = Number(searchParams.get("page")) || 1;
    const pageSize = Number(searchParams.get("pageSize")) || 50;

    // CLIENT_ADMIN/CLIENT_USER can only ever see their own client's rows —
    // forced from the verified JWT-derived header, never a client-supplied
    // param, regardless of what (if anything) the request asked for.
    const { isClientRole, clientId: ownClientId } = getRequesterClientScope(req);
    if (isClientRole) {
      if (!ownClientId) {
        return NextResponse.json({ documents: [], total: 0, page, pageSize }, { status: 200 });
      }
      clientId = String(ownClientId);
      businessName = "";
    }

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
      hitlUserId,
      validation,
      sortBy,
      sortOrder,
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
