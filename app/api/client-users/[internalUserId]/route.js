import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { setClientUserActive } from "@/lib/clientUsers";

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

export async function PATCH(req, { params }) {
  const { error, user } = await requireClientAdmin(req);
  if (error) return error;

  try {
    const { internalUserId } = await params;
    const id = Number(internalUserId);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    const { isActive } = await req.json();
    const updated = await setClientUserActive(id, user.clientId, !!isActive);
    if (!updated) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user: updated }, { status: 200 });
  } catch (err) {
    console.error("PATCH /api/client-users/[internalUserId] error:", err);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
