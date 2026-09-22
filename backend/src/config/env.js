import 'dotenv/config';

/**
 * Centralized, validated environment config.
 * Fail fast at boot if a required var is missing instead of crashing
 * unpredictably later inside a request handler.
 */
const required = ['DATABASE_URL', 'JWT_SECRET'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

// Explicit allowlist from env, never a wildcard — two known local clients
// (storefront, admin), each its own origin/port. Reject anything not in
// this list.
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigins,

  database: {
    url: process.env.DATABASE_URL,
    // Small on purpose — see the comment on the Pool in db.js. Each
    // serverless instance keeps its own pool, so this number is per
    // instance, not per deployment.
    poolSize: Number(process.env.DATABASE_POOL_SIZE) || 5,
  },

  blob: {
    // Vercel injects BLOB_READ_WRITE_TOKEN into the deployment as soon as
    // a Blob store is connected to the project (BLOB_STORE_ID appears
    // instead when the newer OIDC credentials are in use). Either one
    // means "a Blob store is reachable", which is the real question —
    // see storage/index.js for why this isn't keyed off NODE_ENV.
    enabled: Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID),
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
};
