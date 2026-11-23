import { Types } from 'mongoose';
import { logger } from '../../lib/logger';
import { StoreVisit } from './storeVisit.model';

/** store|day|viewer keys already counted as a visitor (bounded; reset when too big or the day changes). */
const seen = new Set<string>();
let seenDay = '';

export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);

/**
 * Fire-and-forget: increments today's StoreVisit counter. `visitors` counts each viewerKey once per
 * store per day (best effort, per process). Never throws.
 */
export function recordStoreVisit(storeId: Types.ObjectId | string, viewerKey: string): void {
  const date = utcDay();
  if (date !== seenDay || seen.size > 100_000) {
    seen.clear();
    seenDay = date;
  }
  const key = `${String(storeId)}|${viewerKey}`;
  const isNewVisitor = !seen.has(key);
  if (isNewVisitor) seen.add(key);
  StoreVisit.updateOne(
    { storeId: new Types.ObjectId(String(storeId)), date },
    { $inc: { views: 1, visitors: isNewVisitor ? 1 : 0 } },
    { upsert: true },
  ).catch((err) => logger.warn({ err }, 'store visit update failed'));
}
