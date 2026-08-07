import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { dexaiQuery } from "@/lib/dexaidb";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = ["Active", "Resolved", "Maintenance", "Release Note", "Documentation"];

// Only SUPER_ADMIN can change an announcement's status.
export async function PATCH(req, { params }) {
  const user = await verifyAuthToken(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.roles?.includes("SUPER_ADMIN"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  try {
    const { status } = (await req.json()) || {};
    if (status !== null && !ALLOWED_STATUSES.includes(status))
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });

    const result = await dexaiQuery(
      `UPDATE announcements SET status = $1 WHERE id = $2 RETURNING id, status`,
      [status || null, Number(id)]
    );
    if (result.rowCount === 0)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, status: result.rows[0].status });
  } catch (err) {
    console.error("PATCH /api/announcements/[id] error:", err);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}

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
