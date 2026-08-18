#!/usr/bin/env node
/**
 * Grant hitlEdit page access to capium@client.com
 * Run: node scripts/grant-hitl-access.js
 * (from project root with MAIN_FINANCE_DB_URL set, or via: node -r dotenv/config scripts/grant-hitl-access.js)
 */

const { Pool } = require("pg");

const TARGET_EMAIL = process.argv[2] || "capium@client.com";

async function main() {
  const connectionString = process.env.MAIN_FINANCE_DB_URL;
  if (!connectionString) {
    console.error("MAIN_FINANCE_DB_URL not set. Try:\n  node -r dotenv/config scripts/grant-hitl-access.js");
    process.exit(1);
  }

  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    const check = await pool.query(
      `SELECT internal_user_id, email, page_access FROM internal_users WHERE LOWER(email) = LOWER($1)`,
      [TARGET_EMAIL]
    );

    if (check.rows.length === 0) {
      console.error(`ERROR: No user found with email '${TARGET_EMAIL}'`);
      process.exit(1);
    }

    const user = check.rows[0];
    console.log(`Found: id=${user.internal_user_id}, email=${user.email}`);
    console.log(`Current page_access: ${JSON.stringify(user.page_access)}`);

    const newAccess = {
      dashboard:     true,
      businessAudit: true,
      bugTracker:    true,
      ...(user.page_access || {}),
      hitlEdit:      true,
    };

    const result = await pool.query(
      `UPDATE internal_users
          SET page_access = $2::jsonb, updated_at = CURRENT_TIMESTAMP
        WHERE internal_user_id = $1
        RETURNING internal_user_id, email, page_access`,
      [user.internal_user_id, JSON.stringify(newAccess)]
    );

    const updated = result.rows[0];
    console.log(`\n✅ Success! page_access is now: ${JSON.stringify(updated.page_access)}`);
    console.log(`\n⚠️  capium@client.com must log out and log back in for the HITL Edit tab to appear.`);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
