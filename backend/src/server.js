import app from './app.js';
import { env } from './config/env.js';
import { checkDbConnection } from './config/db.js';

async function start() {
  try {
    await checkDbConnection();
    console.log('✔ MySQL connection pool is healthy');
  } catch (err) {
    console.error('✘ Failed to connect to MySQL:', err.message);
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
