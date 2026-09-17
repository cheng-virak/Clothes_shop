import mysql from 'mysql2/promise';
import { env } from './env.js';

/**
 * Shared connection pool. Always use `pool.execute(sql, params)` (never
 * string-concatenated SQL) so every query is server-side prepared and
 * parameterized — this is what prevents SQL injection.
 */
export const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: env.db.connectionLimit,
  queueLimit: 0,
  decimalNumbers: true, // return DECIMAL columns as JS numbers instead of strings
  // undefined for local dev (no TLS on a loopback socket); set when
  // DB_SSL=true for hosted MySQL, which always requires it. See env.js.
  ...(env.db.ssl ? { ssl: env.db.ssl } : {}),
});

export async function checkDbConnection() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}

/**
 * Run `work(connection)` inside a transaction. Commits on success,
 * rolls back and rethrows on any error. Use for anything that touches
 * more than one table where partial writes would corrupt data
 * (order creation + stock decrement, product + variants, etc).
 */
export async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
