/**
 * Helper to determine if a user has permission to view detailed request processing logs.
 *
 * Restricted specifically to:
 * - Superadmins (superadmin / SUPER_ADMIN role)
 * - surya@dexai.app
 * - adil@dexai.app
 * - subham@dexai.app
 */

export const AUTHORIZED_LOG_EMAILS = new Set([
  "surya@dexai.app",
  "adil@dexai.app",
  "subham@dexai.app",
]);

export function canViewRequestLogs(user) {
  if (!user) return false;

  const email = (user.email || "").toLowerCase().trim();
  if (AUTHORIZED_LOG_EMAILS.has(email)) {
    return true;
  }

  const roles = Array.isArray(user.roles)
    ? user.roles
    : typeof user.roles === "string"
    ? user.roles.split(",")
    : [];

  return roles.some((r) => {
    const roleStr = String(r).toLowerCase().trim();
    return roleStr === "superadmin" || roleStr === "super_admin";
  });
}
