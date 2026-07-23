import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { updateClient } from "@/lib/dexai";
import { dexaiQuery } from "@/lib/dexaidb";

async function requireSuperAdmin(req) {
  const user = await verifyAuthToken(req);
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!user.roles?.includes("SUPER_ADMIN")) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user };
}

export async function PATCH(req, { params }) {
  const { error } = await requireSuperAdmin(req);
  if (error) return error;

  try {
    const { userId } = await params;
    const id = Number(userId);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    const body = await req.json();
    const { email, firstName, lastName, companyName } = body || {};

    const updated = await updateClient(id, { email, firstName, lastName, companyName });
    if (!updated) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Keep a linked CLIENT_ADMIN/CLIENT_USER login's email in sync with the
    // client record it represents, so they keep logging in with the same
    // address shown here.
    if (email) {
      await dexaiQuery(
        `UPDATE internal_users SET email = LOWER($2), updated_at = CURRENT_TIMESTAMP WHERE client_id = $1`,
        [id, email]
      );
    }

    return NextResponse.json({ client: updated }, { status: 200 });
  } catch (err) {
    console.error("PATCH /api/user-logs/[userId] error:", err);
    return NextResponse.json({ error: err.message || "Failed to update client" }, { status: 400 });
  }
}
