import { cookies } from "next/headers";
import { verifyAuthToken } from "@/lib/auth";
import { financeQuery } from "@/lib/financedb";

export async function POST(req) {
  try {
    // Read the current user BEFORE clearing the cookie — this stamps
    // logged_out_at so the auto-assignment eligibility check
    // (lib/hitlAssignment.js) stops treating them as logged in immediately,
    // rather than waiting for their 24h session to naturally age out.
    const user = await verifyAuthToken(req);
    if (user) {
      try {
        await financeQuery(`UPDATE internal_users SET logged_out_at = CURRENT_TIMESTAMP WHERE internal_user_id = $1`, [user.userId]);
      } catch (dbErr) {
        console.error("Failed to record logout:", dbErr.message);
      }
    }

    const cookieStore = await cookies();
    cookieStore.delete("auth_token");

    return Response.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    return Response.json(
      { error: "An error occurred during logout" },
      { status: 500 }
    );
  }
}
