import mongoose from 'mongoose';
import { env } from './env.js';

/**
 * MongoDB connection. Replaces the mysql2 pool in db.js — Mongoose keeps
 * its own internal connection pool, so there's no pool object to pass
 * around; models are imported directly wherever they're needed.
 */
// Cached so repeated calls (server.js at boot, or the per-request guard in
// app.js on serverless hosts like Vercel) share one connection.
let connecting = null;

export async function connectMongo() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!connecting) {
    mongoose.set('strictQuery', true);
    connecting = mongoose
      .connect(env.mongo.uri, {
        dbName: env.mongo.dbName,
        maxPoolSize: env.mongo.poolSize,
        serverSelectionTimeoutMS: 10000,
      })
      .catch((err) => {
        connecting = null; // allow a retry on the next request
        throw err;
      });
  }
  await connecting;
  return mongoose.connection;
}

export async function checkDbConnection() {
  // admin().ping() goes to the server rather than just reading the local
  // readyState flag, so this fails loudly if the socket is up but the
  // cluster isn't actually answering.
  await mongoose.connection.db.admin().ping();
}

export async function disconnectMongo() {
  await mongoose.disconnect();
}

/**
 * Run `work(session)` inside a MongoDB transaction — the direct
 * counterpart of db.js's withTransaction(conn).
 *
 * Requires a replica set; Atlas always provides one, but a bare local
 * `mongod` started standalone does not, and will throw
 * "Transaction numbers are only allowed on a replica set member or mongos".
 * That's surfaced as-is rather than silently degrading to non-atomic
 * writes, because every caller here (checkout, order status changes)
 * depends on all-or-nothing behaviour for stock correctness.
 *
 * Callers must pass the session into every query they run, e.g.
 * `Product.findById(id).session(session)` / `doc.save({ session })`.
 */
export async function withTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
