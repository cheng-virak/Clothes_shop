import fs from 'node:fs';
import 'dotenv/config';

/**
 * Centralized, validated environment config.
 * Fail fast at boot if a required var is missing instead of crashing
 * unpredictably later inside a request handler.
 */

/**
 * Hosted MySQL providers (Railway, Aiven, PlanetScale, …) hand out a
 * single connection URL rather than five separate fields, so DATABASE_URL
 * is accepted as a shorthand for the DB_* vars. Local dev is unaffected:
 * leave it unset and the discrete vars are used exactly as before.
 */
function parseDatabaseUrl(url) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 3306,
    // Credentials arrive percent-encoded in a URL — a password containing
    // "@" or "#" is mangled without this.
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
  };
}

const dbFromUrl = process.env.DATABASE_URL ? parseDatabaseUrl(process.env.DATABASE_URL) : null;

const required = dbFromUrl
  ? ['JWT_SECRET']
  : ['DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

/**
 * Hosted MySQL requires TLS; a local socket doesn't. `DB_SSL=true` is
 * enough for providers whose cert chains to a public root (Railway,
 * PlanetScale). Providers that issue their own CA (Aiven) also need
 * DB_SSL_CA_PATH pointing at the downloaded ca.pem.
 *
 * rejectUnauthorized stays true — turning it off would make the
 * connection encrypted but unauthenticated, i.e. still open to a
 * man-in-the-middle, which defeats the point of enabling TLS at all.
 */
function buildSslConfig() {
  if (process.env.DB_SSL !== 'true') return undefined;

  const caPath = process.env.DB_SSL_CA_PATH;
  if (caPath) {
    if (!fs.existsSync(caPath)) {
      throw new Error(`DB_SSL_CA_PATH points at a file that doesn't exist: ${caPath}`);
    }
    return { ca: fs.readFileSync(caPath, 'utf8'), rejectUnauthorized: true };
  }
  return { rejectUnauthorized: true };
}

// Explicit allowlist, not a wildcard — two known local clients (storefront,
// admin), each its own origin/port. Reject anything not in this list.
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigins,

  db: {
    host: dbFromUrl?.host ?? process.env.DB_HOST,
    port: dbFromUrl?.port ?? (Number(process.env.DB_PORT) || 3306),
    user: dbFromUrl?.user ?? process.env.DB_USER,
    password: dbFromUrl?.password ?? (process.env.DB_PASSWORD || ''),
    database: dbFromUrl?.database ?? process.env.DB_NAME,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
    ssl: buildSslConfig(),
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
};
