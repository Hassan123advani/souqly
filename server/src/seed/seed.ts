import path from 'node:path';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { env, isProd, isWeakAdminPassword } from '../config/env';
import { logger } from '../lib/logger';
import { hashPassword } from '../modules/auth/auth.service';
import { User } from '../modules/users/user.model';
import { generateReferralCode } from '../modules/users/user.service';
import { seedCatalog } from './catalog';
import { seedOrders } from './orders';
import { seedDelivery } from './delivery';
import { seedSocial } from './social';
import { seedAdminDemo, seedPages } from './admin';
import { seedGrowth } from './growth';
import { clearDemoData } from './clear';
import { SEED_STORES } from './data/stores';

/**
 * Demo accounts (all `demo: true`, removed by `npm run seed:clear`). Password for all: Demo1234
 *   ayesha@demo.souqly.pk  — Ayesha Khan  (buyer)
 *   bilal@demo.souqly.pk   — Bilal Ahmed  (buyer)
 *   sana@demo.souqly.pk    — Sana Malik   (buyer)
 * Demo sellers (store owners): see src/seed/data/stores.ts, e.g. noor@demo.souqly.pk (Noor Textiles).
 * Admin staff: moderator@demo.souqly.pk (MODERATOR). Pending store owners: pending1/pending2@demo.souqly.pk.
 * Super Admin: ADMIN_EMAIL / ADMIN_PASSWORD from server/.env (defaults souqly@gmail.com / souqly123 in
 * development; production refuses the default / weak passwords and skips demo users unless `--demo`).
 */
export const DEMO_PASSWORD = 'Demo1234';
export const DEMO_BUYERS = [
  { name: 'Ayesha Khan', email: 'ayesha@demo.souqly.pk', phone: '+923001110001', language: 'en' as const },
  { name: 'Bilal Ahmed', email: 'bilal@demo.souqly.pk', phone: '+923001110002', language: 'ur' as const },
  { name: 'Sana Malik', email: 'sana@demo.souqly.pk', phone: '+923001110003', language: 'en' as const },
];

/** Creates the Super Admin if missing. Never overwrites an existing admin's password. */
async function ensureSuperAdmin(production: boolean): Promise<'created' | 'exists'> {
  const email = env.ADMIN_EMAIL.toLowerCase();
  if (production && isWeakAdminPassword(env.ADMIN_PASSWORD)) {
    throw new Error('Refusing to seed the Super Admin with the default / a weak ADMIN_PASSWORD in production (12+ characters required)');
  }
  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.platformRole !== 'SUPER_ADMIN') {
      logger.warn({ email }, 'ADMIN_EMAIL belongs to an existing non-admin user; not changing it');
    }
    return 'exists';
  }
  await User.create({
    name: env.ADMIN_NAME,
    email,
    passwordHash: await hashPassword(env.ADMIN_PASSWORD),
    platformRole: 'SUPER_ADMIN',
    emailVerified: true,
    passwordChangeRecommended: true,
    referralCode: await generateReferralCode(),
  });
  return 'created';
}

async function seedDemoBuyers(passwordHash: string): Promise<number> {
  let created = 0;
  for (const b of DEMO_BUYERS) {
    if (await User.exists({ email: b.email })) continue;
    await User.create({
      name: b.name,
      email: b.email,
      phone: b.phone,
      passwordHash,
      emailVerified: true,
      phoneVerified: true,
      preferences: { language: b.language },
      referralCode: await generateReferralCode(),
      coins: 250,
      demo: true,
    });
    created++;
  }
  return created;
}

/**
 * Idempotent seed. Demo users/stores (shared password Demo1234) are created everywhere except
 * production, where they need an explicit `demo: true` (`npm run seed -- --demo`).
 * `production` defaults to NODE_ENV and exists for tests.
 */
export async function runSeed(opts: { reset?: boolean; demo?: boolean; production?: boolean } = {}): Promise<void> {
  const production = opts.production ?? isProd;
  const includeDemo = opts.demo ?? !production;
  if (opts.reset) await clearDemoData();
  const admin = await ensureSuperAdmin(production);
  const pages = await seedPages();
  if (!includeDemo) {
    logger.info({ admin, pages }, 'Seed complete (demo users skipped; pass --demo to include them)');
    return;
  }
  // Hash the demo password ONCE and reuse it for every demo user (bcrypt is slow on purpose).
  const demoHash = await hashPassword(DEMO_PASSWORD);
  const buyers = await seedDemoBuyers(demoHash);
  const catalog = await seedCatalog(demoHash);
  const orders = await seedOrders();
  const delivery = await seedDelivery(demoHash);
  const social = await seedSocial();
  const adminDemo = await seedAdminDemo(demoHash);
  const growth = await seedGrowth(); // Phase 10 (after payouts so the ledger includes them)
  logger.info({ admin, pages, demoBuyersCreated: buyers, catalog, orders, delivery, social, adminDemo, growth }, 'Seed complete');
  logger.info(
    `Login: ${env.ADMIN_EMAIL} (Super Admin) | demo buyers: ${DEMO_BUYERS.map((b) => b.email).join(', ')} | ` +
      `demo sellers: ${SEED_STORES.map((s) => s.owner.email).join(', ')} — password ${DEMO_PASSWORD}`,
  );
}

// CLI: `npm run seed [-- --reset] [-- --demo]`
const isCli = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isCli) {
  (async () => {
    if (!env.MONGODB_URI) {
      logger.info('MONGODB_URI is not set: the dev server seeds its in-memory database automatically on boot. Nothing to do.');
      return;
    }
    await mongoose.connect(env.MONGODB_URI);
    await runSeed({ reset: process.argv.includes('--reset'), ...(process.argv.includes('--demo') ? { demo: true } : {}) });
    await mongoose.disconnect();
  })().catch(async (err) => {
    logger.error({ err }, 'Seed failed');
    await mongoose.disconnect().catch(() => undefined);
    process.exitCode = 1;
  });
}
