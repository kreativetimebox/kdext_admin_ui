import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import {
  acquireDocumentLock,
  heartbeatDocumentLock,
  releaseDocumentLock,
} from "@/lib/documentLock";

export async function POST(req, { params }) {
  try {
    const user = await verifyAuthToken(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Document ID required" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action || "acquire";
    const tabId = body?.tabId || req.headers.get("x-tab-id") || "";

    if (action === "release") {
      const result = releaseDocumentLock(id, user, tabId);
      return NextResponse.json(result, { status: 200 });
    }

    if (action === "heartbeat") {
      const result = heartbeatDocumentLock(id, user, tabId);
      return NextResponse.json(result, { status: 200 });
    }

    // Default: acquire
    const result = acquireDocumentLock(id, user, tabId);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("Lock API error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
