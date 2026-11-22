import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { logger } from '../lib/logger';
import { env, isProd } from './env';

let memoryServer: MongoMemoryServer | null = null;
let usingMemory = false;

/**
 * Connects to MONGODB_URI. Without it (and outside production) an in-memory MongoDB is started.
 * Returns `inMemory: true` so the caller can auto-seed the empty database.
 */
export async function connectDb(): Promise<{ inMemory: boolean }> {
  let uri = env.MONGODB_URI;
  if (!uri) {
    if (isProd) throw new Error('MONGODB_URI is required in production');
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    // The mongod binary is downloaded and cached on first start (can take a minute once).
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri('souqly');
    usingMemory = true;
    const line = '='.repeat(78);
    logger.warn(
      `\x1b[33m\n${line}\n  WARNING: MONGODB_URI is not set — using an IN-MEMORY MongoDB.\n` +
        `  All data resets on restart. Demo data is seeded automatically on every boot.\n` +
        `  Set MONGODB_URI in server/.env to keep data.\n${line}\x1b[0m`,
    );
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  logger.info({ inMemory: usingMemory }, 'MongoDB connected');
  return { inMemory: usingMemory };
}

export function isInMemoryDb(): boolean {
  return usingMemory;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}
