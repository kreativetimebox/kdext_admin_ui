import { NextResponse } from "next/server";
import { getTransactionRecords } from "@/lib/transactions";

export async function GET() {
  try {
    const rows = await getTransactionRecords();
    const records = rows.map((row) => ({
      result_id: row.result_id,
      request_id: row.request_id,
      transaction_id: row.transaction_id,
      document_path: row.document_path,
      original_filename: row.original_filename,
      document_type: row.document_type,
      status: row.status,
      submitted_at: row.submitted_at,
      completed_at: row.completed_at,
    }));
    return NextResponse.json({ records }, { status: 200 });
  } catch (error) {
    console.error("GET /api/transactions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch transaction records" },
      { status: 500 }
    );
  }
}
