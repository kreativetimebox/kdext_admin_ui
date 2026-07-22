// Team member (internal_users) management for the User Logs → Team Members
// tab. Separate from lib/dexai.js's client-facing `users` table queries —
// internal_users/roles/user_roles live in the same MAIN_FINANCE_DB but are a
// completely different table family (login accounts for this app, not the
// document-processing pipeline's end users).
import { hash } from "bcryptjs";
import { financeQuery, financeTransaction } from "@/lib/financedb";
import { TEAM_ROLES } from "@/lib/constants";

const TEAM_MEMBER_SORT_COLUMNS = new Set([
  "first_name",
  "last_name",
  "email",
  "is_active",
  "created_at",
  "updated_at",
  "last_login_at",
]);

function buildSort(sortBy, sortOrder) {
  const column = TEAM_MEMBER_SORT_COLUMNS.has(sortBy) ? sortBy : "first_name";
  const direction = String(sortOrder).toUpperCase() === "DESC" ? "DESC" : "ASC";
  return `${column} ${direction} NULLS LAST`;
}

function rolesToArray(roles) {
  return roles
    ? roles.split(",").map((r) => r.trim()).filter(Boolean)
    : [];
}

export async function getTeamMembers(filters = {}) {
  const { search = "", sortBy = "first_name", sortOrder = "ASC" } = filters;

  const whereConditions = [];
  const params = [];
  let paramIndex = 1;

  if (search) {
    params.push(`%${search}%`);
    whereConditions.push(`(
      iu.email ILIKE $${paramIndex}
      OR COALESCE(iu.first_name, '') ILIKE $${paramIndex}
      OR COALESCE(iu.last_name, '') ILIKE $${paramIndex}
    )`);
    paramIndex++;
  }

  const whereClause = whereConditions.length ? `WHERE ${whereConditions.join(" AND ")}` : "";

  const result = await financeQuery(
    `SELECT
       iu.internal_user_id,
       iu.email,
       iu.first_name,
       iu.last_name,
       iu.is_active,
       iu.created_at,
       iu.updated_at,
       iu.last_login_at,
       COALESCE(STRING_AGG(r.role_name, ',' ORDER BY r.role_name), '') AS roles
     FROM internal_users iu
     LEFT JOIN user_roles ur ON ur.internal_user_id = iu.internal_user_id
     LEFT JOIN roles r ON r.role_id = ur.role_id
     ${whereClause}
     GROUP BY iu.internal_user_id, iu.email, iu.first_name, iu.last_name, iu.is_active,
              iu.created_at, iu.updated_at, iu.last_login_at
     ORDER BY ${buildSort(sortBy, sortOrder)}`,
    params
  );

  return result.rows.map((row) => ({
    ...row,
    roles: rolesToArray(row.roles),
  }));
}

function validateRoles(roles) {
  if (!Array.isArray(roles) || roles.length === 0) {
    throw new Error("At least one role is required");
  }
  const invalid = roles.filter((r) => !TEAM_ROLES.includes(r));
  if (invalid.length) {
    throw new Error(`Invalid role(s): ${invalid.join(", ")}`);
  }
}

export async function createTeamMember({ email, firstName, lastName, password, roles }) {
  validateRoles(roles);
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const existing = await financeQuery(
    `SELECT internal_user_id FROM internal_users WHERE LOWER(email) = LOWER($1)`,
    [email]
  );
  if (existing.rows.length > 0) {
    throw new Error("A user with this email already exists");
  }

  const passwordHash = await hash(password, 12);

  return financeTransaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO internal_users (email, first_name, last_name, password_hash, is_active, failed_login_attempts)
       VALUES (LOWER($1), $2, $3, $4, true, 0)
       RETURNING internal_user_id, email, first_name, last_name, is_active, created_at, updated_at, last_login_at`,
      [email, firstName || null, lastName || null, passwordHash]
    );
    const user = inserted.rows[0];

    await client.query(
      `INSERT INTO user_roles (internal_user_id, role_id)
       SELECT $1, role_id FROM roles WHERE role_name = ANY($2::text[])`,
      [user.internal_user_id, roles]
    );

    return { ...user, roles };
  });
}

export async function updateTeamMember(internalUserId, { email, firstName, lastName, password, roles }) {
  validateRoles(roles);

  if (email) {
    const existing = await financeQuery(
      `SELECT internal_user_id FROM internal_users WHERE LOWER(email) = LOWER($1) AND internal_user_id <> $2`,
      [email, internalUserId]
    );
    if (existing.rows.length > 0) {
      throw new Error("A user with this email already exists");
    }
  }

  let passwordHash = null;
  if (password) {
    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }
    passwordHash = await hash(password, 12);
  }

  return financeTransaction(async (client) => {
    const updated = await client.query(
      `UPDATE internal_users
          SET email        = COALESCE(LOWER($2), email),
              first_name   = $3,
              last_name    = $4,
              password_hash = COALESCE($5, password_hash),
              updated_at   = CURRENT_TIMESTAMP
        WHERE internal_user_id = $1
        RETURNING internal_user_id, email, first_name, last_name, is_active, created_at, updated_at, last_login_at`,
      [internalUserId, email || null, firstName || null, lastName || null, passwordHash]
    );
    if (updated.rows.length === 0) return null;

    await client.query(
      `WITH deleted AS (
         DELETE FROM user_roles WHERE internal_user_id = $1
       )
       INSERT INTO user_roles (internal_user_id, role_id)
       SELECT $1, role_id FROM roles WHERE role_name = ANY($2::text[])`,
      [internalUserId, roles]
    );

    return { ...updated.rows[0], roles };
  });
}

// Deactivating a HITL member would otherwise strand their in-progress
// review queue: the auto-assignment poller (lib/hitlAssignment.js) only
// ever picks up rows where hitl_assigned_to IS NULL, so a still-assigned row
// under a now-inactive member would never get redistributed. Freeing those
// rows here (same NULL/NULL shape the manual unassign path in
// app/api/document/[id]/assign-hitl/route.js already uses) puts them back in
// the pool the next poll tick — or app/missing-fields's assign dropdown —
// picks up.
export async function setTeamMemberActive(internalUserId, isActive) {
  return financeTransaction(async (client) => {
    const updated = await client.query(
      `UPDATE internal_users
          SET is_active = $2,
              updated_at = CURRENT_TIMESTAMP,
              locked_until = CASE WHEN $2 THEN NULL ELSE locked_until END,
              failed_login_attempts = CASE WHEN $2 THEN 0 ELSE failed_login_attempts END
        WHERE internal_user_id = $1
        RETURNING internal_user_id, email, first_name, last_name, is_active`,
      [internalUserId, isActive]
    );
    const member = updated.rows[0];
    if (!member) return null;

    let unassignedCount = 0;
    if (!isActive) {
      const unassigned = await client.query(
        `UPDATE document_processing_requests
            SET hitl_assigned_to = NULL,
                hitl_status = NULL,
                updated_at = CURRENT_TIMESTAMP
          WHERE hitl_assigned_to = $1::text
            AND hitl_status IS DISTINCT FROM 'COMPLETED'
            AND is_deleted = false
          RETURNING result_id`,
        [internalUserId]
      );
      unassignedCount = unassigned.rowCount;
    }

    return { ...member, unassignedCount };
  });
}
