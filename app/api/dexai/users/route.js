import { NextResponse } from "next/server";
import { getDexaiUsers } from "@/lib/dexai";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const rows = await getDexaiUsers({ search });
    return NextResponse.json({ users: rows }, { status: 200 });
  } catch (error) {
    console.error("GET /api/dexai/users error:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}
