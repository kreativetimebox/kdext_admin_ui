import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { getTeamMembers, createTeamMember } from "@/lib/teamMembers";

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

export async function GET(req) {
  const { error } = await requireSuperAdmin(req);
  if (error) return error;

  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const sortBy = searchParams.get("sortBy") || "first_name";
    const sortOrder = searchParams.get("sortOrder") || "ASC";

    const members = await getTeamMembers({ search, sortBy, sortOrder });
    return NextResponse.json({ members });
  } catch (err) {
    console.error("GET /api/team-members error:", err);
    return NextResponse.json({ error: "Failed to fetch team members" }, { status: 500 });
  }
}

export async function POST(req) {
  const { error } = await requireSuperAdmin(req);
  if (error) return error;

  try {
    const body = await req.json();
    const { email, firstName, lastName, password, roles } = body || {};

    if (!email || !password || !Array.isArray(roles) || roles.length === 0) {
      return NextResponse.json(
        { error: "email, password, and at least one role are required" },
        { status: 400 }
      );
    }

    const member = await createTeamMember({ email, firstName, lastName, password, roles });
    return NextResponse.json({ member }, { status: 201 });
  } catch (err) {
    console.error("POST /api/team-members error:", err);
    return NextResponse.json({ error: err.message || "Failed to create team member" }, { status: 400 });
  }
}
