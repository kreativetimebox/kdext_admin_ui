import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { setClientUserActive, updateClientUserPageAccess, deleteClientUser } from "@/lib/clientUsers";
import { dexaiQuery } from "@/lib/dexaidb";

// Resolves the correct clientId for the target user when the caller is a
// SUPER_ADMIN (who has no clientId themselves but can manage any client).
async function resolveClientId(internalUserId) {
  const r = await dexaiQuery(
    `SELECT client_id FROM internal_users WHERE internal_user_id = $1 AND client_id IS NOT NULL`,
    [internalUserId]
  );
  return r.rows[0]?.client_id ?? null;
}

async function requireClientAdminOrSuper(req) {
  const user = await verifyAuthToken(req);
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const isSuper = user.roles?.includes("SUPER_ADMIN");
  const isClientMgr = user.roles?.some((r) => ["CLIENT_ADMIN", "CLIENT"].includes(r));
  if (!isSuper && !isClientMgr) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (isClientMgr && !user.clientId) {
    return { error: NextResponse.json({ error: "This account has no client scope" }, { status: 403 }) };
  }
  return { user, isSuper };
}

export async function PATCH(req, { params }) {
  const { error, user, isSuper } = await requireClientAdminOrSuper(req);
  if (error) return error;

  try {
    const { internalUserId } = await params;
    const id = Number(internalUserId);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    const body = await req.json();

    // SUPER_ADMIN has no clientId of their own — look it up from the target row.
    const clientId = isSuper ? await resolveClientId(id) : user.clientId;
    if (!clientId) {
      return NextResponse.json({ error: "User not found or not a client sub-user" }, { status: 404 });
    }

    // pageAccess update (may be sent alone or alongside isActive)
    if (body.pageAccess !== undefined) {
      if (typeof body.pageAccess !== "object" || body.pageAccess === null) {
        return NextResponse.json({ error: "pageAccess must be an object" }, { status: 400 });
      }
      const updated = await updateClientUserPageAccess(id, clientId, body.pageAccess);
      if (!updated) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      // If only pageAccess was sent, return now.
      if (body.isActive === undefined) {
        return NextResponse.json({ user: updated }, { status: 200 });
      }
    }

    // isActive toggle
    if (body.isActive !== undefined) {
      const updated = await setClientUserActive(id, clientId, !!body.isActive);
      if (!updated) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      return NextResponse.json({ user: updated }, { status: 200 });
    }

    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  } catch (err) {
    console.error("PATCH /api/client-users/[internalUserId] error:", err);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  const { error, user, isSuper } = await requireClientAdminOrSuper(req);
  if (error) return error;

  try {
    const { internalUserId } = await params;
    const id = Number(internalUserId);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    const clientId = isSuper ? await resolveClientId(id) : user.clientId;
    if (!clientId) {
      return NextResponse.json({ error: "User not found or not a client sub-user" }, { status: 404 });
    }

    const deleted = await deleteClientUser(id, clientId);
    if (!deleted) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, user: deleted }, { status: 200 });
  } catch (err) {
    console.error("DELETE /api/client-users/[internalUserId] error:", err);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}

