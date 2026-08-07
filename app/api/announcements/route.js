import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { dexaiQuery, dexaiTransaction } from "@/lib/dexaidb";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB per file
const ALLOWED_TYPES = [
  "application/pdf",
  "image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp",
];

// Everyone signed in can read the announcement feed.
export async function GET(req) {
  const user = await verifyAuthToken(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await dexaiQuery(
      `SELECT a.id, a.title, a.body, a.created_by_email, a.created_at,
              COALESCE(
                (SELECT json_agg(json_build_object(
                   'id', at.id, 'filename', at.filename,
                   'contentType', at.content_type, 'size', at.byte_size) ORDER BY at.id)
                 FROM announcement_attachments at WHERE at.announcement_id = a.id),
                '[]'::json) AS attachments
         FROM announcements a
        ORDER BY a.created_at DESC`
    );
    return NextResponse.json({ announcements: result.rows });
  } catch (err) {
    console.error("GET /api/announcements error:", err);
    return NextResponse.json({ error: "Failed to load announcements" }, { status: 500 });
  }
}

// Only SUPER_ADMIN can post an announcement (title + body + pdf/image files).
export async function POST(req) {
  const user = await verifyAuthToken(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.roles?.includes("SUPER_ADMIN"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const form = await req.formData();
    const title = (form.get("title") || "").toString().trim();
    const body = (form.get("body") || "").toString();
    const files = form.getAll("files").filter((f) => f && typeof f.arrayBuffer === "function");

    if (!title && !body && files.length === 0) {
      return NextResponse.json({ error: "Nothing to post" }, { status: 400 });
    }

    const prepared = [];
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: `"${file.name}" exceeds the 15 MB limit` }, { status: 400 }
        );
      }
      const type = file.type || "application/octet-stream";
      if (!ALLOWED_TYPES.includes(type)) {
        return NextResponse.json(
          { error: `"${file.name}" is not a PDF or image` }, { status: 400 }
        );
      }
      prepared.push({
        name: file.name || "file",
        type,
        size: file.size,
        buffer: Buffer.from(await file.arrayBuffer()),
      });
    }

    const created = await dexaiTransaction(async (client) => {
      const ins = await client.query(
        `INSERT INTO announcements (title, body, created_by, created_by_email)
         VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
        [title || null, body || null, user.userId || null, user.email || null]
      );
      const id = ins.rows[0].id;
      for (const f of prepared) {
        await client.query(
          `INSERT INTO announcement_attachments (announcement_id, filename, content_type, byte_size, content)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, f.name, f.type, f.size, f.buffer]
        );
      }
      return { id, created_at: ins.rows[0].created_at };
    });

    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (err) {
    console.error("POST /api/announcements error:", err);
    return NextResponse.json({ error: "Failed to post announcement" }, { status: 500 });
  }
}
