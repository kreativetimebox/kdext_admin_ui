import { jwtVerify } from "jose";
import { NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production"
);

const ALLOWED_ROLES = ["SUPER_ADMIN", "HITL", "ADMIN", "SERVER_MONITOR"];
const PUBLIC_ROUTES = ["/auth/login"];

// Full-access admin roles. A user who has none of these but DOES have
// SERVER_MONITOR is a restricted account that may only reach the server pages.
const ADMIN_ROLES = ["SUPER_ADMIN", "HITL", "ADMIN"];
const SERVER_ONLY_PREFIXES = ["/server-monitor", "/api/server-monitor", "/api/auth"];

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (PUBLIC_ROUTES.includes(pathname)) {
    return NextResponse.next();
  }

  // Allow API auth routes
  if (pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  // Check for token in cookies (request.cookies is synchronous in middleware)
  const token = request.cookies.get("auth_token");

  if (!token) {
    // Redirect to login if not authenticated
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  try {
    // Verify JWT token
    const verified = await jwtVerify(token.value, JWT_SECRET);
    const payload = verified.payload;

    // Check if user has required roles
    const userRoles = payload.roles || [];
    const hasRequiredRole = userRoles.some((role) =>
      ALLOWED_ROLES.includes(role)
    );

    if (!hasRequiredRole) {
      // Redirect to unauthorized page or login
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }

    // Restricted server-monitor accounts (SERVER_MONITOR without any admin role)
    // may only reach the server pages/APIs; everything else bounces there.
    const isAdmin = userRoles.some((role) => ADMIN_ROLES.includes(role));
    if (!isAdmin) {
      const allowed = SERVER_ONLY_PREFIXES.some(
        (p) => pathname === p || pathname.startsWith(p + "/")
      );
      if (!allowed) {
        return NextResponse.redirect(new URL("/server-monitor", request.url));
      }
    }

    // Add user info to request headers for use in API routes
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", payload.userId);
    requestHeaders.set("x-user-email", payload.email);
    requestHeaders.set("x-user-roles", JSON.stringify(userRoles));

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch (error) {
    console.error("Token verification error:", error);
    // Invalid token, redirect to login
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }
}

// Configure which routes to run middleware on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public files)
     */
    "/((?!_next/static|_next/image|favicon.ico|public).*)",
  ],
};
