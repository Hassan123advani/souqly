import http from 'node:http';
import { connectDb, disconnectDb } from './config/db';
import { env, integrations } from './config/env';
import { logger } from './lib/logger';
import { getJobs } from './services/jobs';
import { closeSocket, initSocket } from './socket';

async function main() {
  const { inMemory } = await connectDb();
  // Import the app after the env/db are ready (registers all models).
  const { app } = await import('./app');

  if (inMemory) {
    const { runSeed } = await import('./seed/seed');
    await runSeed();
  }

  const server = http.createServer(app);
  initSocket(server);

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

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
