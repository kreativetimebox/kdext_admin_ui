import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { getClientUsers, createClientUser } from "@/lib/clientUsers";

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

export async function GET(req) {
  const { error, user } = await requireClientAdmin(req);
  if (error) return error;

  try {
    const users = await getClientUsers(user.clientId);
    return NextResponse.json({ users }, { status: 200 });
  } catch (err) {
    console.error("GET /api/client-users error:", err);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

export async function POST(req) {
  const authUser = await verifyAuthToken(req);
  if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isSuper = authUser.roles?.includes("SUPER_ADMIN");
  const isClientMgr = authUser.roles?.some((r) => ["CLIENT_ADMIN", "CLIENT"].includes(r));
  if (!isSuper && !isClientMgr)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = (await req.json()) || {};
    const { email, firstName, lastName, password, pageAccess } = body;

    // SUPER_ADMIN targets any client (clientId from the body) and creates a
    // CLIENT sub-user by default. A CLIENT/CLIENT_ADMIN can only ever create
    // under their own client scope.
    let targetClientId;
    let subRole;
    if (isSuper) {
      targetClientId = Number(body.clientId);
      if (!targetClientId)
        return NextResponse.json({ error: "clientId is required" }, { status: 400 });
      subRole = body.role === "CLIENT_USER" ? "CLIENT_USER" : "CLIENT";
    } else {
      if (!authUser.clientId)
        return NextResponse.json({ error: "This account has no client scope" }, { status: 403 });
      targetClientId = authUser.clientId;
      subRole = authUser.roles?.includes("CLIENT_ADMIN") ? "CLIENT_USER" : "CLIENT";
    }

    const created = await createClientUser(targetClientId, {
      email, firstName, lastName, password, role: subRole, pageAccess,
    });
    return NextResponse.json({ user: created }, { status: 201 });
  } catch (err) {
    console.error("POST /api/client-users error:", err);
    return NextResponse.json({ error: err.message || "Failed to create user" }, { status: 400 });
  }
}
