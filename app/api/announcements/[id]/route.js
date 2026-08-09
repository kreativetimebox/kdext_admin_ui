import { NextResponse } from "next/server";
import sanitizeHtml from "sanitize-html";
import { verifyAuthToken } from "@/lib/auth";
import { dexaiQuery } from "@/lib/dexaidb";
import { BODY_SANITIZE_OPTIONS } from "@/lib/announcementSanitize";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = ["Active", "Resolved", "Maintenance", "Release Note", "Documentation"];

// Only SUPER_ADMIN can edit an announcement (status, and/or title + body).
// Only fields present in the payload are updated.
export async function PATCH(req, { params }) {
  const user = await verifyAuthToken(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.roles?.includes("SUPER_ADMIN"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  try {
    const payload = (await req.json()) || {};
    const sets = [];
    const values = [];

    if ("status" in payload) {
      const { status } = payload;
      if (status !== null && !ALLOWED_STATUSES.includes(status))
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      values.push(status || null);
      sets.push(`status = $${values.length}`);
    }
    if ("title" in payload) {
      values.push((payload.title || "").toString().trim() || null);
      sets.push(`title = $${values.length}`);
    }
    if ("body" in payload) {
      const sanitized = sanitizeHtml((payload.body || "").toString(), BODY_SANITIZE_OPTIONS).trim();
      const hasText = sanitizeHtml(sanitized, { allowedTags: [], allowedAttributes: {} }).trim().length > 0;
      values.push(hasText ? sanitized : null);
      sets.push(`body = $${values.length}`);
    }
    if (sets.length === 0)
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

    values.push(Number(id));
    const result = await dexaiQuery(
      `UPDATE announcements SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING id, title, body, status`,
      values
    );
    if (result.rowCount === 0)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, ...result.rows[0] });
  } catch (err) {
    console.error("PATCH /api/announcements/[id] error:", err);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
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
