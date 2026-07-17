import { NextResponse } from "next/server";
import { getDexaiUserResults } from "@/lib/dexai";

export async function GET(request, { params }) {
  try {
    const { userId } = await params;
    const id = Number(userId);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const docType = searchParams.get("docType") || "";
    const status = searchParams.get("status") || "";
    const keyEnvironment = searchParams.get("keyEnvironment") || "";

    const records = await getDexaiUserResults(id, { search, docType, status, keyEnvironment });
    return NextResponse.json({ records }, { status: 200 });
  } catch (error) {
    console.error("GET /api/dexai/users/[userId]/results error:", error);
    return NextResponse.json(
      { error: "Failed to fetch user results" },
      { status: 500 }
    );
  }
}
