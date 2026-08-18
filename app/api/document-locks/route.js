import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { getActiveDocumentLocks } from "@/lib/documentLock";

export async function GET(req) {
  try {
    const user = await verifyAuthToken(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const locks = getActiveDocumentLocks();
    return NextResponse.json({ locks }, { status: 200 });
  } catch (err) {
    console.error("GET /api/document-locks error:", err);
    return NextResponse.json({ locks: {} }, { status: 200 });
  }
}
