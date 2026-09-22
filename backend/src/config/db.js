import pg from 'pg';
import { env } from './env.js';

const { Pool, types } = pg;

/**
 * PostgreSQL (Neon) connection. node-postgres owns a real connection
 * pool, so `pool` is the single object every query goes through.
 *
 * Two driver defaults are overridden below, both because they would
 * silently change the JSON the API returns.
 */

// numeric/decimal arrives as a STRING by default, because a Postgres
// numeric can exceed what a JS double represents exactly. Every numeric
// column here is money or a small rate, all well inside the safe range,
// and the clients expect `base_price: 19.99`, not `"19.99"` -- so parse
// it. Without this, prices would render as strings and arithmetic like
// unitPrice * quantity would silently concatenate.
types.setTypeParser(types.builtins.NUMERIC, (value) => (value === null ? null : Number(value)));
// int8/bigint is a string for the same reason, and COUNT(*) returns one.
types.setTypeParser(types.builtins.INT8, (value) => (value === null ? null : Number(value)));

/**
 * Drop the TLS query parameters from the connection string so the `ssl`
 * option below is the only thing deciding how the connection is secured.
 *
 * This is not cosmetic. node-postgres parses `connectionString` AFTER
 * applying the explicit config and lets the URL win, so an `sslmode` in
 * the URL silently overrides `ssl` here. Today pg treats `sslmode=require`
 * as verify-full, but it warns that pg 9 will switch it to libpq
 * semantics, where `require` encrypts WITHOUT verifying the server
 * certificate — which would quietly downgrade this connection to one that
 * an interceptor can sit in the middle of. `channel_binding` goes too: it
 * is a libpq option that node-postgres does not implement, so leaving it
 * in only suggests a protection that isn't there.
 *
 * Neon's own copy-paste string carries both, so they're stripped here
 * rather than relying on whoever fills in DATABASE_URL to edit them out.
 */
function withoutTlsParams(rawUrl) {
  const url = new URL(rawUrl);
  url.searchParams.delete('sslmode');
  url.searchParams.delete('channel_binding');
  return url.toString();
}

export const pool = new Pool({
  connectionString: withoutTlsParams(env.database.url),
  // Neon's certificate chains to a public CA that is already in Node's
  // trust store, so the server is fully verified — no disabled checks.
  ssl: { rejectUnauthorized: true },
  // Deliberately small. On a serverless host each warm instance holds its
  // own pool, so a large max here multiplies by the instance count and
  // exhausts Neon's connection limit. Use the -pooler endpoint (Neon's
  // PgBouncer) in DATABASE_URL and keep this low.
  max: env.database.poolSize,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

// An idle client erroring (Neon scaling to zero, a network blip) emits on
// the pool, and an unhandled 'error' event would take the process down.
// The pool discards the dead client by itself; the next query gets a new one.
pool.on('error', (err) => {
  console.error('[pg] idle client error:', err.message);
});

/** Run a single query outside any transaction. */
export function query(text, params) {
  return pool.query(text, params);
}

export async function checkDbConnection() {
  await pool.query('SELECT 1');
}

export async function closePool() {
  await pool.end();
}

/**
 * Run `work(client)` inside a transaction: a plain BEGIN/COMMIT on one
 * checked-out connection.
 *
 * Callers must pass that `client` into every query they run. A query
 * sent through `query()` instead goes out on a different connection,
 * outside the transaction, and will not roll back with it — which fails
 * silently, since the statement still succeeds on its own.
 */
export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    // Best effort: if the connection itself died, the rollback fails too,
    // and the original error is the one worth surfacing.
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
