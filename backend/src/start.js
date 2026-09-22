/**
 * Long-running server entrypoint — local development, or any host that
 * runs a process rather than invoking a function.
 *
 * Deliberately NOT named server.js (or index.js) even though that would
 * read more naturally. Vercel's Express support auto-detects the
 * entrypoint by filename, and `src/server.js`, `src/index.js` and
 * `src/app.js` are ALL on the list it looks for. With two of them
 * present, which one gets deployed depends on an undocumented
 * precedence, and picking this file would be wrong: it calls
 * `app.listen()` and `process.exit(1)`, so a transient database blip at
 * cold start would kill the whole function instance instead of failing
 * one request. Naming it `start.js` keeps it off that list, leaving
 * `src/app.js` — which just exports the app — as the only candidate.
 */
import app from './app.js';
import { env } from './config/env.js';
import { checkDbConnection } from './config/db.js';

async function start() {
  try {
    await checkDbConnection();
    const { host } = new URL(env.database.url);
    console.log(`✔ PostgreSQL connected (${host})`);
  } catch (err) {
    console.error('✘ Failed to connect to PostgreSQL:', err.message);
    process.exit(1);
  }

  const server = app.listen(env.port, () => {
    console.log(`✔ Server listening on port ${env.port} [${env.nodeEnv}]`);
  });

  // Fail loudly instead of leaving the process in a broken state.
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled promise rejection:', err);
    server.close(() => process.exit(1));
  });
}

start();
