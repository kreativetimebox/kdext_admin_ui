import { jwtVerify } from "jose";
import { cookies } from "next/headers";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production"
);

/**
 * Verify authentication token from request cookies
 * Returns user object if valid, or null if invalid
 */
export async function verifyAuthToken(req) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token");

    if (!token) {
      return null;
    }

    const verified = await jwtVerify(token.value, JWT_SECRET);
    const payload = verified.payload;

    return {
      userId: payload.userId,
      email: payload.email,
      roles: payload.roles || [],
      clientId: payload.clientId ?? null,
      pageAccess: payload.pageAccess ?? null,
    };
  } catch (error) {
    console.error("Auth verification error:", error);
    return null;
  }
}
