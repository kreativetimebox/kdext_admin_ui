import { NextResponse } from "next/server";
import { verifyAuthToken } from "@/lib/auth";
import { updateTeamMember, setTeamMemberActive } from "@/lib/teamMembers";

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

function isSelf(user, id) {
  return String(user.userId) === String(id);
}

// PUT — edit a team member's details and role assignments. Blocks a
// SUPER_ADMIN from stripping their own SUPER_ADMIN role, since that would
// lock them out of user management with no other super admin able to fix it.
export async function PUT(req, { params }) {
  const { user, error } = await requireSuperAdmin(req);
  if (error) return error;

  try {
    const { id } = await params;
    const body = await req.json();
    const { email, firstName, lastName, password, roles } = body || {};

    if (!Array.isArray(roles) || roles.length === 0) {
      return NextResponse.json({ error: "At least one role is required" }, { status: 400 });
    }

    if (isSelf(user, id) && !roles.includes("SUPER_ADMIN")) {
      return NextResponse.json(
        { error: "You cannot remove your own SUPER_ADMIN role" },
        { status: 400 }
      );
    }

    const member = await updateTeamMember(id, { email, firstName, lastName, password, roles });
    if (!member) {
      return NextResponse.json({ error: "Team member not found" }, { status: 404 });
    }
    return NextResponse.json({ member });
  } catch (err) {
    console.error("PUT /api/team-members/[id] error:", err);
    return NextResponse.json({ error: err.message || "Failed to update team member" }, { status: 400 });
  }
}

// PATCH — reactivate a previously-deactivated team member.
export async function PATCH(req, { params }) {
  const { error } = await requireSuperAdmin(req);
  if (error) return error;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    if (body?.isActive !== true) {
      return NextResponse.json({ error: "isActive: true is required" }, { status: 400 });
    }

    const member = await setTeamMemberActive(id, true);
    if (!member) {
      return NextResponse.json({ error: "Team member not found" }, { status: 404 });
    }
    return NextResponse.json({ member });
  } catch (err) {
    console.error("PATCH /api/team-members/[id] error:", err);
    return NextResponse.json({ error: err.message || "Failed to reactivate team member" }, { status: 400 });
  }
}

// DELETE — deactivate (soft delete) a team member. Blocks deactivating your
// own account for the same self-lockout reason as the role check above.
export async function DELETE(req, { params }) {
  const { user, error } = await requireSuperAdmin(req);
  if (error) return error;

  try {
    const { id } = await params;

    if (isSelf(user, id)) {
      return NextResponse.json(
        { error: "You cannot deactivate your own account" },
        { status: 400 }
      );
    }

    const member = await setTeamMemberActive(id, false);
    if (!member) {
      return NextResponse.json({ error: "Team member not found" }, { status: 404 });
    }
    return NextResponse.json({ member });
  } catch (err) {
    console.error("DELETE /api/team-members/[id] error:", err);
    return NextResponse.json({ error: err.message || "Failed to deactivate team member" }, { status: 400 });
  }
}
