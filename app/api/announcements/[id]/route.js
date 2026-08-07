import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { dexaiQuery } from "@/lib/dexaidb";

export const dynamic = "force-dynamic";

// Only SUPER_ADMIN can delete an announcement (attachments cascade).
export async function DELETE(req, { params }) {
  const user = await verifyAuthToken(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.roles?.includes("SUPER_ADMIN"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  try {
    const result = await dexaiQuery(
      `DELETE FROM announcements WHERE id = $1 RETURNING id`,
      [Number(id)]
    );
    if (result.rowCount === 0)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/announcements/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
