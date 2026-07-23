import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { getTeamMemberCredentials, setTeamMemberPassword } from "@/lib/teamMembers";

// SUPER_ADMIN can view a team member's current password (reversible-encrypted
// copy, same approach as client logins) for every internal-staff role —
// CLIENT_USER never gets this, and CLIENT_ADMIN credentials live under
// /api/user-logs/[userId]/credentials instead.
export async function GET(req, { params }) {
  const user = await verifyAuthToken(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user.roles?.includes("SUPER_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const creds = await getTeamMemberCredentials(id);
    if (!creds) {
      return NextResponse.json({ error: "Team member not found" }, { status: 404 });
    }
    return NextResponse.json(creds, { status: 200 });
  } catch (err) {
    console.error("GET /api/team-members/[id]/credentials error:", err);
    return NextResponse.json({ error: "Failed to fetch credentials" }, { status: 500 });
  }
}

// PUT: set a new password without touching roles/other fields.
export async function PUT(req, { params }) {
  const user = await verifyAuthToken(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user.roles?.includes("SUPER_ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const { newPassword } = await req.json();

    const updated = await setTeamMemberPassword(id, newPassword);
    if (!updated) {
      return NextResponse.json({ error: "Team member not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("PUT /api/team-members/[id]/credentials error:", err);
    return NextResponse.json({ error: err.message || "Failed to set password" }, { status: 400 });
  }
}
