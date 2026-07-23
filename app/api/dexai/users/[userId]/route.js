import { NextResponse } from "next/server";
import { getDexaiUserById } from "@/lib/dexai";
import { getRequesterClientScope } from "@/lib/clientAccess";

export async function GET(request, { params }) {
  try {
    const { userId } = await params;
    const id = Number(userId);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    // CLIENT_ADMIN/CLIENT_USER can only ever view their own client record.
    const { isClientRole, clientId } = getRequesterClientScope(request);
    if (isClientRole && id !== clientId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const row = await getDexaiUserById(id);
    if (!row) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json(row, { status: 200 });
  } catch (error) {
    console.error("GET /api/dexai/users/[userId] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: 500 }
    );
  }
}
