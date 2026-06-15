import { NextResponse } from "next/server";
import { dexaiQuery } from "@/lib/dexaidb";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const showAll = searchParams.get("showAll") === "true";

    const result = await dexaiQuery(
      `SELECT
         d.request_id as id,
         d.request_id,
         d.transaction_id as result_id,
         d.transaction_id,
         d.status,
         d.submitted_at,
         d.created_at,
         d.updated_at,
         d.ocr_document_type,
         d.formatted_result,
         d.document_type_id,
         dt.type_name,
         dt.mandatory_fields,
         CASE
           WHEN d.formatted_result IS NULL THEN ARRAY[]::text[]
           ELSE (
             SELECT ARRAY_AGG(field)
             FROM jsonb_object_keys(d.formatted_result::jsonb) AS field
           )
         END AS present_fields
       FROM document_processing_requests d
       LEFT JOIN document_types dt ON dt.document_type_id = d.document_type_id
       WHERE d.is_deleted = false
       ORDER BY d.created_at DESC NULLS LAST
       LIMIT 500`,
      []
    );

    const documents = result.rows.map((row) => {
      const mandatory = row.mandatory_fields || [];
      const present = row.present_fields || [];
      const missing = mandatory.filter((f) => !present.includes(f));

      return {
        id: row.id,
        request_id: row.request_id,
        result_id: row.result_id,
        transaction_id: row.transaction_id,
        status: row.status,
        submitted_at: row.submitted_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        ocr_document_type: row.ocr_document_type || row.type_name || "Unknown",
        document_type_id: row.document_type_id,
        missing_fields: missing,
        missing_count: missing.length,
      };
    });

    // Filter to only docs with missing fields if not showing all
    const filtered = showAll
      ? documents
      : documents.filter((d) => d.missing_count > 0);

    return NextResponse.json(
      {
        documents: filtered,
        total: filtered.length,
      },
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
