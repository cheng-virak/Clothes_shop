import app from './app.js';
import { env } from './config/env.js';
import { connectMongo, checkDbConnection } from './config/mongo.js';

async function start() {
  try {
    await connectMongo();
    await checkDbConnection();
    console.log(`✔ MongoDB connected (${env.mongo.dbName})`);
  } catch (err) {
    console.error('✘ Failed to connect to MongoDB:', err.message);
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
