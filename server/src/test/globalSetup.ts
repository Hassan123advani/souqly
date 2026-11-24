import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { GlobalSetupContext } from 'vitest/node';

let mongod: MongoMemoryReplSet | undefined;

/**
 * One single-node replica set for the whole run (each test file uses its own database). A replica
 * set (wiredTiger) is required for multi-document transactions used by billing/finance (D-078).
 */
export async function setup({ provide }: GlobalSetupContext) {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  provide('mongoUri', mongod.getUri());
}

export async function teardown() {
  await mongod?.stop();
}

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}
