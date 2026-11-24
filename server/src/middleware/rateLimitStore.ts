import type { ClientRateLimitInfo, IncrementResponse, Options, Store } from 'express-rate-limit';
import mongoose, { Schema } from 'mongoose';

/**
 * Shared rate-limit counters in MongoDB (security review M4). On Vercel every function instance has its
 * own memory, so the default MemoryStore would give each instance a fresh budget; this store keeps one
 * counter per key for all instances. Used only when SERVERLESS (local dev and tests keep the MemoryStore).
 * Documents expire through a TTL index on `resetAt`. Redis is not installed (D-012), so there is no Redis store.
 */
interface IRateLimitHit {
  _id: string;
  count: number;
  resetAt: Date;
}

const schema = new Schema<IRateLimitHit>({ _id: { type: String, required: true }, count: { type: Number, required: true }, resetAt: { type: Date, required: true } }, { versionKey: false });
schema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });
export const RateLimitHit = mongoose.models.RateLimitHit ?? mongoose.model<IRateLimitHit>('RateLimitHit', schema);

export class MongoRateLimitStore implements Store {
  windowMs = 60_000;
  /** Counters are shared between instances, so the library must not assume it owns them. */
  localKeys = false;
  readonly prefix: string;

  constructor(prefix: string) {
    this.prefix = `rl:${prefix}:`;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private id(key: string) {
    return `${this.prefix}${key}`.slice(0, 400);
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const doc = await RateLimitHit.findById(this.id(key)).lean<IRateLimitHit>();
    if (!doc || doc.resetAt.getTime() <= Date.now()) return undefined;
    return { totalHits: doc.count, resetTime: doc.resetAt };
  }

  /** Atomic: one pipeline upsert restarts an expired window or adds a hit to the current one. */
  async increment(key: string): Promise<IncrementResponse> {
    const now = new Date();
    const expired = { $or: [{ $eq: [{ $type: '$resetAt' }, 'missing'] }, { $lte: ['$resetAt', now] }] };
    const doc = await RateLimitHit.collection.findOneAndUpdate(
      { _id: this.id(key) as never },
      [
        {
          $set: {
            count: { $cond: [expired, 1, { $add: ['$count', 1] }] },
            resetAt: { $cond: [expired, new Date(now.getTime() + this.windowMs), '$resetAt'] },
          },
        },
      ],
      { upsert: true, returnDocument: 'after' },
    );
    const d = doc as unknown as IRateLimitHit | null;
    return { totalHits: d?.count ?? 1, resetTime: d?.resetAt ?? new Date(now.getTime() + this.windowMs) };
  }

  async decrement(key: string): Promise<void> {
    await RateLimitHit.updateOne({ _id: this.id(key), count: { $gt: 0 } }, { $inc: { count: -1 } });
  }

  async resetKey(key: string): Promise<void> {
    await RateLimitHit.deleteOne({ _id: this.id(key) });
  }

  async resetAll(): Promise<void> {
    await RateLimitHit.deleteMany({ _id: { $regex: `^${this.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } });
  }
}
