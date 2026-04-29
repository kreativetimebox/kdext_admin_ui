import { NextResponse } from "next/server";
import { getDocumentById } from "@/lib/queries";
import { getDownloadFileUrl } from "@/lib/aws";

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const doc = await getDocumentById(id);

    if (!doc || !doc.source_file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const filename = doc.source_file.split("/").pop();
    const url = await getDownloadFileUrl(doc.source_file, filename);

    if (!url) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    return NextResponse.redirect(url, 302);
  } catch (error) {
    console.error("GET /api/document/[id]/download error:", error);
    return NextResponse.json(
      { error: "Failed to generate download URL" },
      { status: 500 }
    );
  }
}
