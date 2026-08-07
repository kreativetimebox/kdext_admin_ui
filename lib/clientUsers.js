// CLIENT_USER account management for a CLIENT_ADMIN's own restricted User
// Logs view. Deliberately separate from lib/teamMembers.js (internal staff,
// SUPER_ADMIN-only, any TEAM_ROLES value) — every read/write here is scoped
// to a single client_id and the role is always hardcoded to CLIENT_USER, so
// a client can never see another client's users or grant themselves a
// higher-privileged role.
//
// CLIENT_USER passwords are viewable/editable — but only by that user's own
// CLIENT_ADMIN (never SUPER_ADMIN; lib/teamMembers.js's credential lookups
// are scoped to client_id IS NULL and never touch these rows).
import { hash } from "bcryptjs";
import { dexaiQuery, dexaiTransaction } from "@/lib/dexaidb";
import { encryptForDisplay, decryptForDisplay } from "@/lib/crypto";

export async function getClientUsers(clientId) {
  const result = await dexaiQuery(
    `SELECT
       iu.internal_user_id,
       iu.email,
       iu.first_name,
       iu.last_name,
       iu.is_active,
       iu.created_at,
       iu.last_login_at,
       iu.page_access,
       COALESCE(STRING_AGG(r.role_name, ',' ORDER BY r.role_name), '') AS roles
     FROM internal_users iu
     LEFT JOIN user_roles ur ON ur.internal_user_id = iu.internal_user_id
     LEFT JOIN roles r ON r.role_id = ur.role_id
     WHERE iu.client_id = $1
     GROUP BY iu.internal_user_id, iu.email, iu.first_name, iu.last_name, iu.is_active,
              iu.created_at, iu.last_login_at, iu.page_access
     ORDER BY iu.created_at DESC`,
    [clientId]
  );
  return result.rows.map((row) => ({
    ...row,
    roles: row.roles ? row.roles.split(",").filter(Boolean) : [],
  }));
}

/**
 * Every CLIENT_USER account across every client, for the SUPER_ADMIN Clients
 * tab's nested CLIENT_ADMIN → CLIENT_USER view (grouped client-side by
 * client_id). Deliberately no password fields here — SUPER_ADMIN never sees
 * CLIENT_USER credentials, only CLIENT_ADMIN's own restricted view does.
 */
export async function getAllClientUsers() {
  const result = await dexaiQuery(
    `SELECT
       iu.internal_user_id,
       iu.client_id,
       iu.email,
       iu.first_name,
       iu.last_name,
       iu.is_active,
       iu.created_at,
       iu.last_login_at
     FROM internal_users iu
     JOIN user_roles ur ON ur.internal_user_id = iu.internal_user_id
     JOIN roles r ON r.role_id = ur.role_id
     WHERE r.role_name = 'CLIENT_USER' AND iu.client_id IS NOT NULL
     ORDER BY iu.client_id, iu.created_at DESC`
  );
  return result.rows;
}

export async function createClientUser(clientId, { email, firstName, lastName, password, role = "CLIENT_USER", pageAccess = null }) {
  // Only these two managed roles may ever be granted here — never an internal
  // (SUPER_ADMIN/ADMIN/HITL) role, so a client can't escalate privilege.
  if (!["CLIENT_USER", "CLIENT"].includes(role)) {
    throw new Error("Invalid sub-user role");
  }
  // Normalise page access to just the known boolean flags (or null = all pages).
  const access = pageAccess && typeof pageAccess === "object"
    ? {
        dashboard: pageAccess.dashboard !== false,
        businessAudit: pageAccess.businessAudit !== false,
        bugTracker: pageAccess.bugTracker !== false,
      }
    : null;
  if (!email) {
    throw new Error("Email is required");
  }
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const existing = await dexaiQuery(
    `SELECT internal_user_id FROM internal_users WHERE LOWER(email) = LOWER($1)`,
    [email]
  );
  if (existing.rows.length > 0) {
    throw new Error("A user with this email already exists");
  }

  const passwordHash = await hash(password, 12);
  const passwordEnc = encryptForDisplay(password);

  return dexaiTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO internal_users (email, first_name, last_name, password_hash, is_active, failed_login_attempts, client_id, client_password_enc, page_access)
       VALUES (LOWER($1), $2, $3, $4, true, 0, $5, $6, $7::jsonb)
       RETURNING internal_user_id, email, first_name, last_name, is_active, created_at, last_login_at, client_id, page_access`,
      [email, firstName || null, lastName || null, passwordHash, clientId, passwordEnc, access ? JSON.stringify(access) : null]
    );
    const user = inserted.rows[0];

    await client.query(
      `INSERT INTO user_roles (internal_user_id, role_id)
       SELECT $1, role_id FROM roles WHERE role_name = $2`,
      [user.internal_user_id, role]
    );

    return { ...user, roles: [role] };
  });
}

/**
 * Activate/deactivate a CLIENT_USER. Scoped to clientId at the SQL level
 * (not just checked beforehand) so a CLIENT_ADMIN can never affect a row
 * outside their own client, and can only ever touch CLIENT_USER accounts —
 * never another client's CLIENT_ADMIN.
 */
export async function setClientUserActive(internalUserId, clientId, isActive) {
  const result = await dexaiQuery(
    `UPDATE internal_users iu
        SET is_active = $3, updated_at = CURRENT_TIMESTAMP
      WHERE iu.internal_user_id = $1
        AND iu.client_id = $2
        AND EXISTS (
          SELECT 1 FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
          WHERE ur.internal_user_id = iu.internal_user_id AND r.role_name IN ('CLIENT_USER', 'CLIENT')
        )
      RETURNING internal_user_id, email, is_active`,
    [internalUserId, clientId, isActive]
  );
  return result.rows[0] || null;
}

/**
 * Decrypt and return a CLIENT_USER's current password for their CLIENT_ADMIN
 * to view. Scoped to clientId + CLIENT_USER role at the SQL level, same as
 * setClientUserActive above — returns null if the row doesn't exist, belongs
 * to a different client, or isn't a CLIENT_USER.
 */
export async function getClientUserCredentials(internalUserId, clientId) {
  const result = await dexaiQuery(
    `SELECT iu.email, iu.is_active, iu.client_password_enc
     FROM internal_users iu
     WHERE iu.internal_user_id = $1
       AND iu.client_id = $2
       AND EXISTS (
         SELECT 1 FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
         WHERE ur.internal_user_id = iu.internal_user_id AND r.role_name = 'CLIENT_USER'
       )`,
    [internalUserId, clientId]
  );
  const row = result.rows[0];
  if (!row) return null;

  return {
    email: row.email,
    isActive: row.is_active,
    password: row.client_password_enc ? decryptForDisplay(row.client_password_enc) : null,
  };
}

/**
 * Set a new password for a CLIENT_USER, chosen by their CLIENT_ADMIN. Same
 * clientId + CLIENT_USER scoping as the functions above.
 */
export async function setClientUserPassword(internalUserId, clientId, newPassword) {
  if (!newPassword || newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  const passwordHash = await hash(newPassword, 12);
  const passwordEnc = encryptForDisplay(newPassword);

  const result = await dexaiQuery(
    `UPDATE internal_users iu
        SET password_hash = $3, client_password_enc = $4, updated_at = CURRENT_TIMESTAMP
      WHERE iu.internal_user_id = $1
        AND iu.client_id = $2
        AND EXISTS (
          SELECT 1 FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
          WHERE ur.internal_user_id = iu.internal_user_id AND r.role_name IN ('CLIENT_USER', 'CLIENT')
        )
      RETURNING internal_user_id, email`,
    [internalUserId, clientId, passwordHash, passwordEnc]
  );
  return result.rows[0] || null;
}
