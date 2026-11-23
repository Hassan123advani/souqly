import http from 'node:http';
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from './config/db';
import { env, integrations } from './config/env';
import { logger } from './lib/logger';
import { getJobs } from './services/jobs';
import { closeSocket, initSocket } from './socket';

async function main() {
  const { inMemory } = await connectDb();
  // Import the app after the env/db are ready (registers all models).
  const { app } = await import('./app');
  await dropLegacyIndexes();

  if (inMemory) {
    const { runSeed } = await import('./seed/seed');
    await runSeed();
  }

  const server = http.createServer(app);
  initSocket(server);
  (await import('./modules/alerts/alert.service')).startAlertJobs(); // Phase 8: 10-min alert sweep

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(env.PORT, resolve);
  });
  logger.info({ integrations }, `Souqly API listening on http://localhost:${env.PORT}/api/v1`);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    try {
      getJobs().stop();
      await closeSocket(); // also closes the attached http server
      if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
      await disconnectDb();
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

/** One-off migrations of index definitions that changed (Mongoose never drops indexes by itself). */
async function dropLegacyIndexes() {
  try {
    const users = mongoose.connection.collection('users');
    const indexes = await users.indexes();
    // Before the M4 fix every phone (verified or not) was unique; now only verified phones are.
    if (indexes.some((i) => i.name === 'phone_1')) {
      await users.dropIndex('phone_1');
      logger.info('Dropped legacy users.phone_1 index (uniqueness now applies to verified phones only)');
      await mongoose.model('User').createIndexes();
    }
  } catch (err) {
    if ((err as { codeName?: string }).codeName === 'NamespaceNotFound') return; // fresh database
    logger.warn({ err }, 'Could not check legacy indexes');
  }
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
