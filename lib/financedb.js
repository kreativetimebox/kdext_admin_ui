import { Pool } from "pg";

let financePool;

function getFinancePool() {
  if (!financePool) {
    financePool = new Pool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    financePool.on("error", (err) => {
      console.error("Unexpected financedb pool error:", err);
    });
  }
  return financePool;
}

export async function financeQuery(text, params) {
  const client = await getFinancePool().connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

export default getFinancePool;
