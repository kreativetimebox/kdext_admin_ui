import { NextResponse } from "next/server";
import { getDocumentList } from "@/lib/queries";

/**
 * In-memory cache for the analyzer sidebar list. The list query is ~2s on
 * the remote DB; caching makes navigations back into /analyzer instant.
 */
const CACHE_TTL_MS = 60 * 1000;
let cached = null; // { expiresAt, body }
let inflight = null;

export async function GET() {
  try {
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return NextResponse.json({ documents: cached.body, cached: true }, { status: 200 });
    }
    if (!inflight) {
      inflight = getDocumentList()
        .then((documents) => {
          cached = { expiresAt: Date.now() + CACHE_TTL_MS, body: documents };
          return documents;
        })
        .finally(() => {
          inflight = null;
        });
    }
    const documents = await inflight;
    return NextResponse.json({ documents, cached: false }, { status: 200 });
  } catch (error) {
    console.error("GET /api/documents error:", error);
    return NextResponse.json(
      { error: "Failed to fetch documents" },
      { status: 500 }
    );
  }
}
