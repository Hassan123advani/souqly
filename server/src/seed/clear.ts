import path from 'node:path';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { Address } from '../modules/account/address.model';
import { AuditLog } from '../modules/audit/auditLog.model';
import { Otp } from '../modules/auth/otp.model';
import { RecentlyViewed, SearchLog } from '../modules/catalog/marketing.models';
import { Product } from '../modules/catalog/product.model';
import { Review } from '../modules/reviews/review.model';
import { Session } from '../modules/auth/session.model';
import { Token } from '../modules/auth/token.model';
import { Store } from '../modules/stores/store.model';
import { StoreMember } from '../modules/stores/storeMember.model';
import { User } from '../modules/users/user.model';
import { getStorage } from '../services/storage';
import { HERO_SLIDES, seedCampaigns } from './data/home';
import { LocalDiskStorage } from '../services/storage/local';

/**
 * Deletes every document marked `demo: true` (plus data owned by demo users).
 * Real users, the Super Admin and settings are never touched.
 */
export async function clearDemoData(): Promise<Record<string, number>> {
  const demoUsers = await User.find({ demo: true }).select('_id phone').lean();
  const userIds = demoUsers.map((u) => u._id);
  const phones = demoUsers.map((u) => u.phone).filter((p): p is string => !!p);
  const demoStores = await Store.find({ demo: true }).select('_id').lean();
  const storeIds = demoStores.map((s) => s._id);

  const demoProducts = await Product.find({ demo: true }).select('_id').lean();
  const productIds = demoProducts.map((p) => p._id);

  const counts: Record<string, number> = {};
  counts.seedFiles = await deleteSeedFiles();
  counts.recentlyViewed = (await RecentlyViewed.deleteMany({ $or: [{ userId: { $in: userIds } }, { productId: { $in: productIds } }] })).deletedCount;
  counts.searchLogs = (await SearchLog.deleteMany({ userId: { $in: userIds } })).deletedCount;
  counts.sessions = (await Session.deleteMany({ userId: { $in: userIds } })).deletedCount;
  counts.tokens = (await Token.deleteMany({ userId: { $in: userIds } })).deletedCount;
  counts.otps = (await Otp.deleteMany({ phone: { $in: phones } })).deletedCount;
  counts.auditLogs = (await AuditLog.deleteMany({ actorId: { $in: userIds } })).deletedCount;
  counts.addresses = (await Address.deleteMany({ $or: [{ demo: true }, { userId: { $in: userIds } }] })).deletedCount;
  counts.storeMembers = (await StoreMember.deleteMany({ $or: [{ demo: true }, { storeId: { $in: storeIds } }, { userId: { $in: userIds } }] }))
    .deletedCount;

  // Any other model that carries a `demo` flag (added by later phases).
  const handled = new Set(['Session', 'Token', 'Otp', 'AuditLog', 'Address', 'StoreMember', 'RecentlyViewed', 'SearchLog']);
  for (const model of Object.values(mongoose.models)) {
    if (handled.has(model.modelName) || !model.schema.path('demo')) continue;
    counts[model.modelName] = (await model.deleteMany({ demo: true })).deletedCount;
  }
  return counts;
}

/**
 * Removes the seed art (everything under the `seed/` storage folder). Local disk: the folder is
 * wiped. Cloudinary: every `seed/...` key referenced by demo documents is deleted.
 */
async function deleteSeedFiles(): Promise<number> {
  const storage = getStorage();
  if (storage instanceof LocalDiskStorage) {
    await storage.deleteFolder('seed');
    return 1;
  }
  const keys = new Set<string>();
  const products = await Product.find({ demo: true }).select('images.key').lean();
  for (const p of products) for (const i of p.images) if (i.key?.startsWith('seed/')) keys.add(i.key);
  const stores = await Store.find({ demo: true }).select('logo.key banner.key').lean();
  for (const s of stores) for (const k of [s.logo?.key, s.banner?.key]) if (k?.startsWith('seed/')) keys.add(k);
  const reviews = await Review.find({ demo: true, hasMedia: true }).select('media.key').lean(); // Phase 8 review photos
  for (const r of reviews) for (const m of r.media) if (m.key?.startsWith('seed/')) keys.add(m.key);
  // Home hero and campaign art keep only a URL, but their keys are deterministic.
  for (const h of HERO_SLIDES) keys.add(`seed/home/hero-${h.key}.svg`);
  for (const c of seedCampaigns(new Date())) keys.add(`seed/campaigns/${c.slug}.svg`);
  let n = 0;
  for (const k of keys) {
    await storage.delete(k).catch((err) => logger.warn({ err, key: k }, 'Failed to delete seed file'));
    n++;
  }
  return n;
}

// CLI: `npm run seed:clear`
const isCli = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isCli) {
  (async () => {
    if (!env.MONGODB_URI) {
      logger.info('MONGODB_URI is not set: the in-memory dev database is wiped on every restart. Nothing to clear.');
      return;
    }
    await mongoose.connect(env.MONGODB_URI);
    const counts = await clearDemoData();
    logger.info({ counts }, 'Demo data removed');
    await mongoose.disconnect();
  })().catch(async (err) => {
    logger.error({ err }, 'Clear failed');
    await mongoose.disconnect().catch(() => undefined);
    process.exitCode = 1;
  });
}
