import { NextResponse } from "next/server";
import sanitizeHtml from "sanitize-html";
import { verifyAuthToken } from "@/lib/auth";
import { dexaiQuery, dexaiTransaction } from "@/lib/dexaidb";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB per file
const ALLOWED_TYPES = [
  "application/pdf",
  "image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp",
];
const ALLOWED_STATUSES = ["Active", "Resolved", "Maintenance", "Release Note", "Documentation"];

// The composer's rich-text toolbar (bold/italic/underline/font-size/color)
// only ever produces this shape via execCommand — allowlisted narrowly since
// this HTML is rendered verbatim (dangerouslySetInnerHTML) for every signed-in
// viewer, not just the posting admin.
const BODY_SANITIZE_OPTIONS = {
  allowedTags: ["b", "strong", "i", "em", "u", "span", "font", "div", "p", "br"],
  allowedAttributes: {
    span: ["style"],
    font: ["style", "color", "size"],
    div: ["style"],
    p: ["style"],
  },
  allowedStyles: {
    "*": {
      color: [/^#[0-9a-f]{3,8}$/i, /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i],
      "font-size": [/^\d+(\.\d+)?px$/],
    },
  },
};

// Everyone signed in can read the announcement feed.
export async function GET(req) {
  const user = await verifyAuthToken(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await dexaiQuery(
      `SELECT a.id, a.title, a.body, a.status, a.created_by_email,
              COALESCE(a.announced_at, a.created_at) AS announced_at,
              a.created_at,
              COALESCE(
                (SELECT json_agg(json_build_object(
                   'id', at.id, 'filename', at.filename,
                   'contentType', at.content_type, 'size', at.byte_size) ORDER BY at.id)
                 FROM announcement_attachments at WHERE at.announcement_id = a.id),
                '[]'::json) AS attachments
         FROM announcements a
        ORDER BY COALESCE(a.announced_at, a.created_at) DESC`
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
    const bodyRaw = (form.get("body") || "").toString();
    const body = sanitizeHtml(bodyRaw, BODY_SANITIZE_OPTIONS).trim();
    const files = form.getAll("files").filter((f) => f && typeof f.arrayBuffer === "function");

    // Optional status tag; must be one of the allowed values if provided.
    const statusRaw = (form.get("status") || "").toString().trim();
    const status = statusRaw || null;
    if (status && !ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // Optional announcement date/time — defaults to now when not provided or
    // unparseable.
    const announcedAtRaw = (form.get("announcedAt") || "").toString().trim();
    let announcedAt = null;
    if (announcedAtRaw) {
      const d = new Date(announcedAtRaw);
      if (!Number.isNaN(d.getTime())) announcedAt = d.toISOString();
    }

    // A contentEditable body with no real content still serializes to
    // boilerplate like "<div><br></div>" — strip tags to check for actual text.
    const bodyHasText = sanitizeHtml(body, { allowedTags: [], allowedAttributes: {} }).trim().length > 0;
    if (!title && !bodyHasText && files.length === 0) {
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
        `INSERT INTO announcements (title, body, status, announced_at, created_by, created_by_email)
         VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()), $5, $6) RETURNING id, created_at`,
        [title || null, bodyHasText ? body : null, status, announcedAt, user.userId || null, user.email || null]
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
