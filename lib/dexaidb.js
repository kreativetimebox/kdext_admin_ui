//lib/dexaidb.js
import { Pool } from "pg";

/*
 * Single shared pool for MAIN_FINANCE_DB.
 *
 * The pool is cached on globalThis (not a module-level `let`) so it SURVIVES
 * Next.js hot-reloads in dev. Without this, every code change re-evaluates this
 * module and spins up a fresh Pool while the old ones keep their RDS
 * connections open — after a handful of reloads you exhaust connections and get
 * intermittent "Connection terminated unexpectedly" / connect timeouts.
 */
const globalForPool = globalThis;

function createPool() {
  const connectionString = process.env.MAIN_FINANCE_DB_URL;
  if (!connectionString) {
    throw new Error("MAIN_FINANCE_DB_URL is not set");
  }
  const pool = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
    max: 10,
    idleTimeoutMillis: 30000,
    // A little more headroom than before: raw TCP to RDS is fast, but a burst
    // of parallel route handlers each opening a fresh SSL connection can
    // occasionally exceed a tight 5s budget.
    connectionTimeoutMillis: 10000,
    // Keep sockets alive so idle connections aren't silently dropped by NAT /
    // the network and then handed out dead on the next checkout.
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });

  pool.on("error", (err) => {
    // A pooled client can die in the background (network blip, RDS recycle).
    // Log it; pg will discard the dead client so the next checkout is fresh.
    console.error("Unexpected MAIN_FINANCE_DB pool error:", err.message);
  });

  return pool;
}

function getPool() {
  if (!globalForPool.__mainFinancePool) {
    globalForPool.__mainFinancePool = createPool();
  }
  return globalForPool.__mainFinancePool;
}

// Connection-level errors from a stale pooled socket — worth one transparent
// retry with a fresh client before surfacing the failure to the caller.
const RETRYABLE = [
  "Connection terminated unexpectedly",
  "Connection terminated due to connection timeout",
  "timeout exceeded when trying to connect",
];

function isRetryable(err) {
  const msg = err?.message || "";
  return RETRYABLE.some((m) => msg.includes(m));
}

export async function dexaiQuery(text, params) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let client;
    try {
      client = await getPool().connect();
      return await client.query(text, params);
    } catch (err) {
      if (attempt === 0 && isRetryable(err)) {
        continue; // one retry to skip past a dead pooled connection
      }
      throw err;
    } finally {
      if (client) client.release();
    }
  }
}

export default getPool;
