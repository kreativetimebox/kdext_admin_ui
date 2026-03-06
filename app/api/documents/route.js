import { NextResponse } from "next/server";
import { getDocumentList } from "@/lib/queries";

export async function GET() {
  try {
    const documents = await getDocumentList();
    return NextResponse.json({ documents }, { status: 200 });
  } catch (error) {
    console.error("GET /api/documents error:", error);
    return NextResponse.json(
      { error: "Failed to fetch documents" },
      { status: 500 }
    );
  }
}
