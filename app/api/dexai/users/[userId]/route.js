import { NextResponse } from "next/server";
import { getDexaiUserById } from "@/lib/dexai";

export async function GET(_request, { params }) {
  try {
    const { userId } = await params;
    const id = Number(userId);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
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
