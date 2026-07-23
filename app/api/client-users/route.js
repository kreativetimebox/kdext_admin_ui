import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { getClientUsers, createClientUser } from "@/lib/clientUsers";

async function requireClientAdmin(req) {
  const user = await verifyAuthToken(req);
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!user.roles?.includes("CLIENT_ADMIN")) {
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
  const { error, user } = await requireClientAdmin(req);
  if (error) return error;

  try {
    const body = await req.json();
    const { email, firstName, lastName, password } = body || {};

    const created = await createClientUser(user.clientId, { email, firstName, lastName, password });
    return NextResponse.json({ user: created }, { status: 201 });
  } catch (err) {
    console.error("POST /api/client-users error:", err);
    return NextResponse.json({ error: err.message || "Failed to create user" }, { status: 400 });
  }
}
