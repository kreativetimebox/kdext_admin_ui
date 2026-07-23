import { jwtVerify } from "jose";
import { cookies } from "next/headers";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production"
);

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token");

    if (!token) {
      return Response.json({ authenticated: false }, { status: 401 });
    }

    const verified = await jwtVerify(token.value, JWT_SECRET);
    const payload = verified.payload;

    return Response.json({
      authenticated: true,
      user: {
        id: payload.userId,
        email: payload.email,
        roles: payload.roles,
        clientId: payload.clientId ?? null,
      },
    });
  } catch (error) {
    console.error("Auth check error:", error);
    return Response.json({ authenticated: false }, { status: 401 });
  }
}
