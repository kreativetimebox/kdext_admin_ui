import { NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { verifyAuthToken } from "@/lib/auth";
import { dexaiQuery } from "@/lib/dexaidb";

export async function POST(req) {
  try {
    const user = await verifyAuthToken(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { currentPassword, newPassword } = await req.json();
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Current and new password are required" }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
    }

    const result = await dexaiQuery(
      `SELECT password_hash FROM internal_users WHERE internal_user_id = $1`,
      [user.userId]
    );
    const row = result.rows[0];
    if (!row) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const isValid = await compare(currentPassword, row.password_hash);
    if (!isValid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
    }

    const newHash = await hash(newPassword, 12);
    await dexaiQuery(
      // Clearing client_password_enc means the Clients tab's "View
      // Credentials" panel can no longer show this account's password once
      // the client has changed it themselves — only the hash is kept from
      // here on, matching normal password-hashing practice.
      `UPDATE internal_users
          SET password_hash = $2,
              client_password_enc = NULL,
              updated_at = CURRENT_TIMESTAMP
        WHERE internal_user_id = $1`,
      [user.userId, newHash]
    );

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("POST /api/auth/change-password error:", error);
    return NextResponse.json({ error: "Failed to change password" }, { status: 500 });
  }
}
