import { NextResponse } from "next/server";
import { updateUiResults } from "@/lib/queries";

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const updated = await updateUiResults(id, body);

    if (!updated) {
      return NextResponse.json(
        { error: "Document not found or update failed" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, id: updated.id, ocr_ui_results: updated.ocr_ui_results },
      { status: 200 }
    );
  } catch (error) {
    console.error("POST /api/document/[id]/update error:", error);
    return NextResponse.json(
      { error: "Failed to save document" },
      { status: 500 }
    );
  }
}
