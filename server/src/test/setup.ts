import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, beforeAll, inject } from 'vitest';

// Every test file gets an isolated database on the shared in-memory server.
beforeAll(async () => {
  const dbName = `test_${crypto.randomBytes(6).toString('hex')}`;
  await mongoose.connect(inject('mongoUri'), { dbName });
  // Importing the app registers every model; then build declared indexes (unique / TTL).
  await import('../app');
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
  }
  await mongoose.disconnect();
});
