import type { OnboardingInput, SellerStore } from '@souqly/shared';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { env } from '../../config/env';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { getEmail } from '../../services/email';
import { audit } from '../audit/audit.service';
import { startSubscription } from '../billing/billing.service';
import { assertActiveCategories } from './categories';
import { getSellerStore } from '../seller/store.service';
import { checkSlug } from '../stores/slug.service';
import { Store } from '../stores/store.model';
import { StoreMember } from '../stores/storeMember.model';
import { User } from '../users/user.model';
import { assertOwnedMedia, tmpPrefix } from './media';
import { sealBusiness, sealPayout } from './sensitive';

/** POST /seller/onboarding: creates a `pending` store owned by the caller. */
export async function onboard(req: Request, input: OnboardingInput): Promise<SellerStore> {
  const userId = req.user!.id;
  if (await Store.exists({ ownerId: userId })) throw new AppError(409, 'ALREADY_SELLER', 'You already have a store');

  const slug = await checkSlug(input.slug);
  if (!slug.available) {
    throw new AppError(409, 'SLUG_UNAVAILABLE', 'This store link is not available', { reason: slug.reason, ...(slug.suggestion ? { suggestion: slug.suggestion } : {}) });
  }
  const prefixes = [tmpPrefix(userId)];
  assertOwnedMedia(input.logo, prefixes);
  assertOwnedMedia(input.banner, prefixes);
  assertOwnedMedia(input.business.idDocument, prefixes);
  const categoryIds = await assertActiveCategories(input.categoryIds);

  const a = input.pickupAddress;
  let store;
  try {
    store = await Store.create({
      ownerId: new Types.ObjectId(userId),
      name: input.name,
      slug: input.slug.toLowerCase(),
      ...(input.tagline ? { tagline: input.tagline } : {}),
      themeColor: input.themeColor,
      categoryIds,
      ...(input.logo ? { logo: input.logo } : {}),
      ...(input.banner ? { banner: input.banner } : {}),
      contact: input.contact,
      address: { line1: a.line1, ...(a.area ? { area: a.area } : {}), city: a.city, country: a.country, ...(a.postalCode ? { postalCode: a.postalCode } : {}) },
      pickupAddress: a,
      policies: input.policies ?? {},
      business: sealBusiness(input.business),
      payout: sealPayout(input.payout),
      status: 'pending',
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new AppError(409, 'SLUG_UNAVAILABLE', 'This store link is not available', { reason: 'taken' });
    throw err;
  }

  try {
    await StoreMember.create({ storeId: store._id, userId: new Types.ObjectId(userId), role: 'OWNER', status: 'active' });
  } catch (err) {
    await Store.deleteOne({ _id: store._id });
    throw err;
  }
  await User.updateOne({ _id: userId }, { $set: { isSeller: true, activeMode: 'seller' } });
  // Billing (docs/api-billing.md §3): every store starts on Free; a paid plan chosen in the wizard gets an
  // upgrade invoice that activates the plan once paid. Never blocks onboarding.
  try {
    const inv = await startSubscription(store._id, input.plan);
    if (inv) await audit({ action: 'billing.upgrade_requested', targetType: 'Invoice', targetId: inv._id, storeId: store._id, meta: { plan: input.plan, total: inv.total, number: inv.number, at: 'onboarding' }, req });
  } catch (err) {
    logger.error({ err, storeId: String(store._id) }, 'Could not start the subscription at onboarding');
  }
  await audit({ action: 'store.onboarded', targetType: 'Store', targetId: store._id, storeId: store._id, meta: { slug: store.slug, name: store.name }, req });

  // Admin notification (in-app notifications arrive in Phase 7).
  const reviewUrl = `${env.CLIENT_URL}/admin/stores/${String(store._id)}`;
  getEmail()
    .send({
      to: env.ADMIN_EMAIL,
      subject: `New store awaiting review: ${store.name}`,
      text: `A new store "${store.name}" (/${store.slug}) is waiting for approval.\nReview: ${reviewUrl}`,
      html: `<p>A new store <strong>${escapeHtml(store.name)}</strong> (/${store.slug}) is waiting for approval.</p><p><a href="${reviewUrl}">Review it</a></p>`,
    })
    .catch((err) => logger.warn({ err }, 'admin store notification failed'));

  const member = (await StoreMember.findOne({ storeId: store._id, userId }))!;
  return getSellerStore(store._id, member);
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
