import { NextResponse } from "next/server";
import { getDexaiUsers } from "@/lib/dexai";
import { getRequesterClientScope } from "@/lib/clientAccess";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";

    // CLIENT_ADMIN/CLIENT_USER only ever see their own client row in this
    // directory — forced from the verified JWT-derived header.
    const { isClientRole, clientId } = getRequesterClientScope(request);
    if (isClientRole && !clientId) {
      return NextResponse.json({ users: [] }, { status: 200 });
    }

    const rows = await getDexaiUsers({ search, userId: isClientRole ? clientId : "" });
    return NextResponse.json({ users: rows }, { status: 200 });
  } catch (error) {
    console.error("GET /api/dexai/users error:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}
