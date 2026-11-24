import mongoose, { type ClientSession } from 'mongoose';

/**
 * Runs `fn` inside a MongoDB multi-document transaction (D-078). The driver retries the whole
 * callback on transient errors (write conflicts), so `fn` must only touch the database through
 * `session` and must not have outside side effects (notifications, audit, emails) — do those
 * after `withTx` resolves. An error thrown by `fn` aborts the transaction and is re-thrown.
 *
 * Requires a replica set: Atlas, or the single-node MongoMemoryReplSet used in dev/test.
 */
export async function withTx<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(
      async () => {
        result = await fn(session);
      },
      { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
    );
    return result as T;
  } finally {
    await session.endSession();
  }
}

/** True for a duplicate-key error (unique index), also when wrapped by the driver. */
export function isDuplicateKey(err: unknown): boolean {
  const e = err as { code?: number; cause?: { code?: number } } | undefined;
  return e?.code === 11000 || e?.cause?.code === 11000;
}
