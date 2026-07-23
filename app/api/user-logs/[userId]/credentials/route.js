import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { dexaiQuery } from "@/lib/dexaidb";
import { decryptForDisplay } from "@/lib/crypto";
import { provisionClientLogin, setClientAdminPassword } from "@/lib/clientProvisioning";

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

// GET: reveal the current (decrypted) portal login for a client, if one exists.
export async function GET(req, { params }) {
  const { error } = await requireSuperAdmin(req);
  if (error) return error;

  try {
    const { userId } = await params;
    const id = Number(userId);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    const result = await dexaiQuery(
      `SELECT internal_user_id, email, is_active, client_password_enc FROM internal_users WHERE client_id = $1`,
      [id]
    );
    const row = result.rows[0];
    if (!row) {
      return NextResponse.json({ provisioned: false }, { status: 200 });
    }

    const password = row.client_password_enc ? decryptForDisplay(row.client_password_enc) : null;
    return NextResponse.json(
      {
        provisioned: true,
        email: row.email,
        isActive: row.is_active,
        // null when the password was changed by the client themselves via
        // self-service (that flow only stores a bcrypt hash, not an
        // encrypted copy) rather than never having been provisioned.
        password,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("GET /api/user-logs/[userId]/credentials error:", err);
    return NextResponse.json({ error: "Failed to fetch credentials" }, { status: 500 });
  }
}

// POST: provision a portal login for a client that doesn't have one yet.
export async function POST(req, { params }) {
  const { error } = await requireSuperAdmin(req);
  if (error) return error;

  try {
    const { userId } = await params;
    const id = Number(userId);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    const created = await provisionClientLogin(id);
    if (!created) {
      return NextResponse.json({ error: "This client already has a portal login" }, { status: 409 });
    }

    return NextResponse.json(
      { email: created.email, password: created.password },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/user-logs/[userId]/credentials error:", err);
    return NextResponse.json({ error: err.message || "Failed to provision login" }, { status: 400 });
  }
}

// PUT: set a new password for an already-provisioned client login.
export async function PUT(req, { params }) {
  const { error } = await requireSuperAdmin(req);
  if (error) return error;

  try {
    const { userId } = await params;
    const id = Number(userId);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    const { newPassword } = await req.json();
    const updated = await setClientAdminPassword(id, newPassword);
    if (!updated) {
      return NextResponse.json({ error: "This client has no portal login yet" }, { status: 404 });
    }
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("PUT /api/user-logs/[userId]/credentials error:", err);
    return NextResponse.json({ error: err.message || "Failed to set password" }, { status: 400 });
  }
}
