// Provisions CLIENT_ADMIN logins in internal_users for rows in the
// document-processing pipeline's client-facing `users` table. Separate from
// lib/teamMembers.js (internal staff) — this links an internal_users row to
// a single users.user_id via client_id so that account's queries can be
// scoped to just that client (lib/clientAccess.js).
import { hash } from "bcryptjs";
import { dexaiQuery, dexaiTransaction } from "@/lib/dexaidb";
import { encryptForDisplay, generateClientPassword } from "@/lib/crypto";

/**
 * Provision a CLIENT_ADMIN login for a single client (users.user_id).
 * No-op if that client already has a linked internal_users row.
 * Returns { internal_user_id, email, first_name, last_name, client_id, password }
 * (password is the one-time plaintext, only ever available at creation time —
 * afterward it's only recoverable via the encrypted column) or null if a
 * login already existed.
 */
export async function provisionClientLogin(clientUserId) {
  const existing = await dexaiQuery(
    `SELECT internal_user_id FROM internal_users WHERE client_id = $1`,
    [clientUserId]
  );
  if (existing.rows.length > 0) return null;

  const clientRow = await dexaiQuery(
    `SELECT user_id, email, first_name, last_name FROM users WHERE user_id = $1`,
    [clientUserId]
  );
  const client = clientRow.rows[0];
  if (!client) {
    throw new Error(`No users row found for user_id ${clientUserId}`);
  }
  if (!client.email) {
    throw new Error(`users.user_id ${clientUserId} has no email to log in with`);
  }

  // internal_users.email is unique — a client's email might already belong
  // to an internal staff account or another client row sharing an address.
  // Skip rather than silently overwrite someone else's login.
  const emailTaken = await dexaiQuery(
    `SELECT internal_user_id FROM internal_users WHERE LOWER(email) = LOWER($1)`,
    [client.email]
  );
  if (emailTaken.rows.length > 0) {
    throw new Error(`Email ${client.email} is already used by another internal_users login`);
  }

  const password = generateClientPassword();
  const passwordHash = await hash(password, 12);
  const passwordEnc = encryptForDisplay(password);

  return dexaiTransaction(async (txClient) => {
    const inserted = await txClient.query(
      `INSERT INTO internal_users
         (email, first_name, last_name, password_hash, is_active, failed_login_attempts, client_id, client_password_enc)
       VALUES (LOWER($1), $2, $3, $4, true, 0, $5, $6)
       RETURNING internal_user_id, email, first_name, last_name, client_id`,
      [client.email, client.first_name || null, client.last_name || null, passwordHash, clientUserId, passwordEnc]
    );
    const created = inserted.rows[0];

    await txClient.query(
      `INSERT INTO user_roles (internal_user_id, role_id)
       SELECT $1, role_id FROM roles WHERE role_name = 'CLIENT_ADMIN'`,
      [created.internal_user_id]
    );

    return { ...created, password };
  });
}

/**
 * Set a new password for an already-provisioned CLIENT_ADMIN login, chosen
 * by SUPER_ADMIN from the Clients tab. Scoped to CLIENT_ADMIN rows only
 * (via the role EXISTS check) so this can never be pointed at some other
 * internal_users row by accident.
 */
export async function setClientAdminPassword(clientUserId, newPassword) {
  if (!newPassword || newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  const passwordHash = await hash(newPassword, 12);
  const passwordEnc = encryptForDisplay(newPassword);

  const result = await dexaiQuery(
    `UPDATE internal_users iu
        SET password_hash = $2, client_password_enc = $3, updated_at = CURRENT_TIMESTAMP
      WHERE iu.client_id = $1
        AND EXISTS (
          SELECT 1 FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
          WHERE ur.internal_user_id = iu.internal_user_id AND r.role_name = 'CLIENT_ADMIN'
        )
      RETURNING internal_user_id, email`,
    [clientUserId, passwordHash, passwordEnc]
  );
  return result.rows[0] || null;
}

/**
 * Bulk-provision every users row that doesn't yet have a linked
 * CLIENT_ADMIN login. Used both by the one-time backfill script and the
 * background poller (lib/clientProvisioningMonitor.js) that catches new
 * signups going forward.
 */
export async function provisionAllMissingClients() {
  const unprovisioned = await dexaiQuery(
    `SELECT u.user_id FROM users u
     LEFT JOIN internal_users iu ON iu.client_id = u.user_id
     WHERE iu.internal_user_id IS NULL
     ORDER BY u.user_id`
  );

  const results = [];
  for (const row of unprovisioned.rows) {
    try {
      const created = await provisionClientLogin(row.user_id);
      results.push(
        created
          ? { userId: row.user_id, ok: true, email: created.email }
          : { userId: row.user_id, ok: true, skipped: true }
      );
    } catch (err) {
      results.push({ userId: row.user_id, ok: false, error: err.message });
    }
  }
  return results;
}
