import { MongoMemoryServer } from 'mongodb-memory-server';
import type { GlobalSetupContext } from 'vitest/node';

let mongod: MongoMemoryServer | undefined;

export async function setup({ provide }: GlobalSetupContext) {
  mongod = await MongoMemoryServer.create();
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
