import { jwtVerify } from "jose";
import { NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production"
);

const ALLOWED_ROLES = ["SUPER_ADMIN", "HITL", "ADMIN", "SERVER_MONITOR", "CLIENT_ADMIN", "CLIENT_USER"];
const PUBLIC_ROUTES = ["/auth/login"];

// Full-access admin roles. A user who has none of these but DOES have
// SERVER_MONITOR is a restricted account that may only reach the server pages.
const ADMIN_ROLES = ["SUPER_ADMIN", "HITL", "ADMIN"];
const SERVER_ONLY_PREFIXES = ["/server-monitor", "/api/server-monitor", "/alerts", "/api/alerts", "/api/auth"];

// Client-side accounts (CLIENT_ADMIN/CLIENT_USER) — confined to their own
// small page set. Data within these pages is further scoped to their own
// client_id at the API/query layer (see lib/clientAccess.js); this list only
// keeps them off pages that make no sense for them at all (Alerts,
// Servers, internal Team Members management, etc).
const CLIENT_ROLES = ["CLIENT_ADMIN", "CLIENT_USER"];
const CLIENT_ALLOWED_PREFIXES = [
  "/", "/dexai", "/missing-fields", "/bug-tracker", "/user-logs", "/view",
  "/api/dexai", "/api/missing-fields", "/api/bug-tracker", "/api/document",
  "/api/hitl-users", "/api/filter-options", "/api/client-users", "/api/auth",
];

function matchesPrefix(pathname, prefixes) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

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

    // Restricted accounts (no ADMIN_ROLES) are confined to their own prefix
    // list — SERVER_MONITOR to the server pages, CLIENT_ADMIN/CLIENT_USER to
    // their own small page set. Client restriction takes precedence on the
    // (unlikely) combination of both, since that's the more limited default.
    const isAdmin = userRoles.some((role) => ADMIN_ROLES.includes(role));
    const isClientOnly = !isAdmin && userRoles.some((role) => CLIENT_ROLES.includes(role));
    if (!isAdmin) {
      if (isClientOnly) {
        if (!matchesPrefix(pathname, CLIENT_ALLOWED_PREFIXES)) {
          return NextResponse.redirect(new URL("/", request.url));
        }
      } else if (!matchesPrefix(pathname, SERVER_ONLY_PREFIXES)) {
        return NextResponse.redirect(new URL("/server-monitor", request.url));
      }
    }

    // Add user info to request headers for use in API routes
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", payload.userId);
    requestHeaders.set("x-user-email", payload.email);
    requestHeaders.set("x-user-roles", JSON.stringify(userRoles));
    // Only meaningful for CLIENT_ADMIN/CLIENT_USER — the users.user_id they
    // represent. lib/clientAccess.js reads this to scope/verify every
    // document read and write to just this client's own rows.
    if (payload.clientId != null) {
      requestHeaders.set("x-user-client-id", String(payload.clientId));
    }

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
