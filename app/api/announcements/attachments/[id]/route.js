import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { dexaiQuery } from "@/lib/dexaidb";

export const dynamic = "force-dynamic";

// Stream a single attachment. Any signed-in user may view (same audience as
// the feed). Images/PDFs render inline; anything else downloads.
export async function GET(req, { params }) {
  const user = await verifyAuthToken(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const result = await dexaiQuery(
      `SELECT filename, content_type, content FROM announcement_attachments WHERE id = $1`,
      [Number(id)]
    );
    const row = result.rows[0];
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const type = row.content_type || "application/octet-stream";
    const inline = type.startsWith("image/") || type === "application/pdf";
    const safeName = String(row.filename || "file").replace(/[\r\n"]/g, "");
    return new NextResponse(row.content, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    console.error("GET /api/announcements/attachments/[id] error:", err);
    return NextResponse.json({ error: "Failed to load attachment" }, { status: 500 });
  }
}
