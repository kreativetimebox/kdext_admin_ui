import { Pool } from "pg";

let pool;

function getPool() {
  if (!pool) {
    const connectionString = process.env.MAIN_FINANCE_DB_URL;
    if (!connectionString) {
      throw new Error("MAIN_FINANCE_DB_URL is not set");
    }
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
    });

    pool.on("error", (err) => {
      console.error("Unexpected MAIN_FINANCE_DB pool error:", err);
    });
  }
  return pool;
}

export async function dexaiQuery(text, params) {
  const client = await getPool().connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

export default getPool;
