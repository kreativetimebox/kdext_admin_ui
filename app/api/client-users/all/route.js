import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { getAllClientUsers } from "@/lib/clientUsers";

// SUPER_ADMIN-only: every CLIENT_USER account across every client, for the
// Clients tab's nested CLIENT_ADMIN -> CLIENT_USER display. Distinct from
// GET /api/client-users, which is CLIENT_ADMIN-only and scoped to their own
// client_id.
export async function GET(req) {
  const user = await verifyAuthToken(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user.roles?.includes("SUPER_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const users = await getAllClientUsers();
    return NextResponse.json({ users }, { status: 200 });
  } catch (err) {
    console.error("GET /api/client-users/all error:", err);
    return NextResponse.json({ error: "Failed to fetch client users" }, { status: 500 });
  }
}
