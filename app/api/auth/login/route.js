import { financeQuery } from "@/lib/financedb";
import { compare } from "bcryptjs";
import { SignJWT } from "jose";
import { cookies } from "next/headers";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production"
);

async function verifyPassword(plainPassword, hash) {
  try {
    return await compare(plainPassword, hash);
  } catch (error) {
    return false;
  }
}

export async function POST(req) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return Response.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Get user from internal_users table with their roles
    const userResult = await financeQuery(
      `SELECT
        iu.internal_user_id,
        iu.email,
        iu.password_hash,
        iu.is_active,
        iu.locked_until,
        iu.failed_login_attempts,
        STRING_AGG(r.role_name, ',' ORDER BY r.role_name) as roles
       FROM internal_users iu
       LEFT JOIN user_roles ur ON iu.internal_user_id = ur.internal_user_id
       LEFT JOIN roles r ON ur.role_id = r.role_id
       WHERE LOWER(iu.email) = LOWER($1)
       GROUP BY iu.internal_user_id, iu.email, iu.password_hash, iu.is_active, iu.locked_until, iu.failed_login_attempts`,
      [email]
    );

    if (userResult.rows.length === 0) {
      return Response.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const user = userResult.rows[0];

    // Check if user is active
    if (!user.is_active) {
      return Response.json(
        { error: "User account is inactive" },
        { status: 403 }
      );
    }

    // Check if user is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return Response.json(
        { error: "Account is locked. Please try again later." },
        { status: 403 }
      );
    }

    // Verify password
    const isPasswordValid = await verifyPassword(password, user.password_hash);

    if (!isPasswordValid) {
      try {
        await financeQuery(`SELECT record_failed_login_attempt($1)`, [email.toLowerCase()]);
        await financeQuery(`SELECT log_internal_login($1, $2, $3, $4, $5)`,
          [user.internal_user_id, false, req.ip, req.headers.get("user-agent") || "", "Invalid password"]);
      } catch (logErr) {
        console.error("Failed to log login attempt:", logErr.message);
      }
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Check if user has required roles (SUPER_ADMIN, HITL, or ADMIN)
    const userRoles = user.roles
      ? user.roles.split(",").map(r => r.trim()).filter(r => r.length > 0)
      : [];
    const allowedRoles = ["SUPER_ADMIN", "HITL", "ADMIN", "SERVER_MONITOR"];
    const hasRequiredRole = userRoles.some(role => allowedRoles.includes(role));

    // Debug log
    console.log(`Login attempt: ${email}, roles: [${userRoles.join(", ")}], allowed: ${hasRequiredRole}`);

    if (!hasRequiredRole) {
      try {
        await financeQuery(`SELECT log_internal_login($1, $2, $3, $4, $5)`,
          [user.internal_user_id, false, req.ip, req.headers.get("user-agent") || "", "Insufficient permissions"]);
      } catch (logErr) {
        console.error("Failed to log login attempt:", logErr.message);
      }
      return Response.json(
        { error: "You do not have permission to access this application" },
        { status: 403 }
      );
    }

    // Update last login and log — non-blocking so logging failures never break auth
    try {
      await financeQuery(`SELECT update_internal_user_last_login($1)`, [user.internal_user_id]);
      await financeQuery(`SELECT log_internal_login($1, $2, $3, $4, $5)`,
        [user.internal_user_id, true, req.ip, req.headers.get("user-agent") || "", null]);
      // Clear any prior logout mark — a fresh login means they're "logged in"
      // again for the auto-assignment eligibility check (lib/hitlAssignment.js).
      await financeQuery(`UPDATE internal_users SET logged_out_at = NULL WHERE internal_user_id = $1`, [user.internal_user_id]);
    } catch (logErr) {
      console.error("Failed to log successful login:", logErr.message);
    }

    // Create JWT token
    const token = await new SignJWT({
      userId: user.internal_user_id,
      email: user.email,
      roles: userRoles,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(JWT_SECRET);

    // Set secure cookie
    const cookieStore = await cookies();
    cookieStore.set("auth_token", token, {
      httpOnly: true,
      // Only mark the cookie Secure when actually served over HTTPS.
      // Over plain HTTP (IP:port) a Secure cookie is dropped by the browser,
      // which breaks the post-login redirect. Set COOKIE_SECURE=true once TLS is in place.
      secure: process.env.COOKIE_SECURE === "true",
      sameSite: "lax",
      maxAge: 24 * 60 * 60, // 24 hours
      path: "/",
    });

    return Response.json({
      success: true,
      user: {
        id: user.internal_user_id,
        email: user.email,
        roles: userRoles,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return Response.json(
      { error: "An error occurred during login" },
      { status: 500 }
    );
  }
}
