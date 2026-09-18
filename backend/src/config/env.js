import 'dotenv/config';

/**
 * Centralized, validated environment config.
 * Fail fast at boot if a required var is missing instead of crashing
 * unpredictably later inside a request handler.
 */
const required = ['MONGODB_URI', 'JWT_SECRET'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
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

  mongo: {
    uri: process.env.MONGODB_URI,
    // The SRV URI from Atlas often carries no database path, and a
    // missing dbName silently lands everything in "test".
    dbName: process.env.MONGODB_DB || 'shope_clothes',
    poolSize: Number(process.env.MONGODB_POOL_SIZE) || 10,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
};
