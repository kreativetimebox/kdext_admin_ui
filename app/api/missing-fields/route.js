import { NextResponse } from "next/server";
import { getDocumentsWithMissingFields } from "@/lib/queries";

/**
 * In-memory cache for the lean missing-fields payload. The underlying SQL has
 * to inspect 15k+ formatted_result JSON blobs which takes ~20s on the remote
 * DB; this cache means only the first request after a TTL miss pays that
 * cost — every subsequent request returns in <50ms.
 *
 * Keyed by (search, docType, showAll). The default empty-filter view is the
 * one that gets the most traffic, so it stays warm.
 */
const CACHE_TTL_MS = 60 * 1000;
const cache = new Map(); // key -> { expiresAt, body }
const inflight = new Map(); // key -> Promise (de-dupe concurrent loads)

function cacheKey({ search, docType, showAll }) {
  return JSON.stringify([search || "", docType || "", !!showAll]);
}

async function loadDocuments(filters) {
  const rows = await getDocumentsWithMissingFields(filters);
  return rows.map((row) => ({
    id: row.id,
    result_id: row.result_id,
    transaction_id: row.transaction_id,
    source: row.source,
    request_id: row.request_id,
    ocr_document_type: row.ocr_document_type,
    created_at: row.created_at,
    submitted_at: row.submitted_at,
    updated_at: row.updated_at,
    missing_count: Number(row.missing_count) || 0,
    missing_fields: row.missing_fields || [],
  }));
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const filters = {
      search: searchParams.get("search") || "",
      docType: searchParams.get("docType") || "",
      showAll: searchParams.get("showAll") === "true",
    };

    const key = cacheKey(filters);
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) {
      return NextResponse.json(
        { documents: cached.body, cached: true },
        { status: 200 }
      );
    }

    // Coalesce concurrent loads so we don't kick off ten 20s queries when
    // the cache misses for the first time.
    let promise = inflight.get(key);
    if (!promise) {
      promise = loadDocuments(filters)
        .then((documents) => {
          cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, body: documents });
          return documents;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, promise);
    }

    const documents = await promise;
    return NextResponse.json({ documents, cached: false }, { status: 200 });
  } catch (error) {
    console.error("GET /api/missing-fields error:", error);
    return NextResponse.json(
      { error: "Failed to fetch documents with missing fields" },
      { status: 500 }
    );
  }
}
