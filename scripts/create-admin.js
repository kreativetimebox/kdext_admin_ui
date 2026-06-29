#!/usr/bin/env node

/**
 * Script to create a new admin user in the database
 * Usage: node scripts/create-admin.js <email> <firstName> <lastName> <password> [role1,role2,...]
 */

const { hash } = require("bcryptjs");
const { Pool } = require("pg");

async function createAdminUser(email, firstName, lastName, password, roles = "SUPER_ADMIN") {
  const connectionString = process.env.MAIN_FINANCE_DB_URL;
  if (!connectionString) {
    console.error("Error: MAIN_FINANCE_DB_URL environment variable is not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString });

  try {
    // Hash the password
    const passwordHash = await hash(password, 12);

    // Parse roles
    const roleArray = roles.split(",").map((r) => r.trim());

    // Create user with roles
    const result = await pool.query(
      `SELECT create_internal_user($1, $2, $3, $4, $5)`,
      [email, firstName, lastName, passwordHash, roleArray]
    );

    if (result.rows.length > 0) {
      const user = result.rows[0].create_internal_user;
      console.log("✓ Admin user created successfully!");
      console.log(`  ID: ${user.internal_user_id}`);
      console.log(`  Email: ${user.email}`);
      console.log(`  Name: ${user.first_name} ${user.last_name}`);
      console.log(`  Roles: ${roleArray.join(", ")}`);
    }
  } catch (error) {
    console.error("Error creating admin user:", error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 4) {
  console.log("Usage: node scripts/create-admin.js <email> <firstName> <lastName> <password> [role1,role2,...]");
  console.log("\nExample:");
  console.log('  node scripts/create-admin.js admin@example.com "Admin" "User" "SecurePassword123" "SUPER_ADMIN"');
  console.log('  node scripts/create-admin.js reviewer@example.com "John" "Reviewer" "Password456" "HITL,ADMIN"');
  console.log("\nAvailable roles: SUPER_ADMIN, HITL, ADMIN, ACCOUNTANT, CLIENT, USER");
  process.exit(1);
}

const [email, firstName, lastName, password, roles = "SUPER_ADMIN"] = args;
createAdminUser(email, firstName, lastName, password, roles);
