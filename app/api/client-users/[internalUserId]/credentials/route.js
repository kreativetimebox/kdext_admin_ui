import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { getClientUserCredentials, setClientUserPassword } from "@/lib/clientUsers";

async function requireClientAdmin(req) {
  const user = await verifyAuthToken(req);
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!user.roles?.some((r) => ["CLIENT_ADMIN", "CLIENT"].includes(r))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (!user.clientId) {
    return { error: NextResponse.json({ error: "This account has no client scope" }, { status: 403 }) };
  }
  return { user };
}

// GET: view a CLIENT_USER's current (decrypted) password.
export async function GET(req, { params }) {
  const { error, user } = await requireClientAdmin(req);
  if (error) return error;

  try {
    const { internalUserId } = await params;
    const id = Number(internalUserId);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    const creds = await getClientUserCredentials(id, user.clientId);
    if (!creds) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json(creds, { status: 200 });
  } catch (err) {
    console.error("GET /api/client-users/[internalUserId]/credentials error:", err);
    return NextResponse.json({ error: "Failed to fetch credentials" }, { status: 500 });
  }
}

// PUT: set a new password for a CLIENT_USER.
export async function PUT(req, { params }) {
  const { error, user } = await requireClientAdmin(req);
  if (error) return error;

  try {
    const { internalUserId } = await params;
    const id = Number(internalUserId);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    const { newPassword } = await req.json();
    const updated = await setClientUserPassword(id, user.clientId, newPassword);
    if (!updated) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("PUT /api/client-users/[internalUserId]/credentials error:", err);
    return NextResponse.json({ error: err.message || "Failed to set password" }, { status: 400 });
  }
}
