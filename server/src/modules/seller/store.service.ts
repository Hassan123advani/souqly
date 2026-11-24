import { normalizePlan, type BusinessInput, type OnboardingChecklist, type PayoutInput, type SellerStore, type StoreUpdateInput } from '@souqly/shared';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../../lib/AppError';
import { resolveMemberPermissions } from '../../middleware/storeContext';
import { audit } from '../audit/audit.service';
import { invalidateStoreIndex } from '../catalog/catalog.service';
import { Product } from '../catalog/product.model';
import { assertActiveCategories } from '../onboarding/categories';
import { assertOwnedMedia, storePrefix, tmpPrefix } from '../onboarding/media';
import { assertStoreDesign } from '../plans/plan.service';
import { maskBusiness, maskPayout, sealBusiness, sealPayout, type StoredBusiness, type StoredPayout } from '../onboarding/sensitive';
import { checkSlug } from '../stores/slug.service';
import { Store, type IStore } from '../stores/store.model';
import type { StoreMemberDoc } from '../stores/storeMember.model';
import { hasCustomShipping } from './storeSettings.service';

const SLUG_CHANGE_INTERVAL_MS = 30 * 24 * 3600_000;

type StoreLean = IStore & { _id: Types.ObjectId };

export async function checklist(s: StoreLean): Promise<OnboardingChecklist> {
  const [firstProduct, shipping] = await Promise.all([
    Product.exists({ storeId: s._id, deletedAt: { $exists: false } }),
    hasCustomShipping(s._id),
  ]);
  const p = s.policies ?? {};
  return {
    logo: !!s.logo?.url,
    banner: !!s.banner?.url,
    firstProduct: !!firstProduct,
    policies: !!(p.shipping || p.returns || p.warranty),
    payout: !!(s.payout as Partial<StoredPayout> | undefined)?.accountNumberEnc,
    shipping,
  };
}

/** Full own-store DTO. Business / payout are ONLY ever returned masked. */
export async function getSellerStore(storeId: Types.ObjectId, member: StoreMemberDoc): Promise<SellerStore> {
  const s = (await Store.findById(storeId).select('+business +payout').lean()) as StoreLean | null;
  if (!s) throw new AppError(404, 'NOT_FOUND', 'Store not found');
  const [check, myPermissions] = await Promise.all([checklist(s), resolveMemberPermissions(member)]);
  const business = maskBusiness(s.business as Partial<StoredBusiness> | undefined);
  const payout = maskPayout(s.payout as Partial<StoredPayout> | undefined);
  return {
    id: String(s._id),
    name: s.name,
    slug: s.slug,
    ...(s.tagline ? { tagline: s.tagline } : {}),
    ...(s.description ? { description: s.description } : {}),
    ...(s.logo?.url ? { logo: { url: s.logo.url, key: s.logo.key } } : {}),
    ...(s.banner?.url ? { banner: { url: s.banner.url, key: s.banner.key } } : {}),
    themeColor: s.themeColor,
    categoryIds: (s.categoryIds ?? []).map(String),
    status: s.status,
    ...(s.status === 'rejected' && s.rejectionReason ? { rejectionReason: s.rejectionReason } : {}),
    isMall: !!s.isMall,
    mallRequested: !!s.mallRequested,
    contact: s.contact ?? {},
    address: s.address ?? {},
    policies: s.policies ?? {},
    seo: s.seo ?? {},
    layoutTemplate: s.layoutTemplate,
    sections: (s.sections ?? []).map((x) => ({ type: x.type, ...(x.title ? { title: x.title } : {}), config: x.config ?? {} })),
    holidayMode: {
      enabled: !!s.holidayMode?.enabled,
      ...(s.holidayMode?.message ? { message: s.holidayMode.message } : {}),
      ...(s.holidayMode?.until ? { until: new Date(s.holidayMode.until).toISOString() } : {}),
    },
    plan: normalizePlan(s.plan),
    billingStatus: s.billingStatus === 'suspended' ? 'suspended' : 'active',
    billingSuspension: s.billingStatus === 'suspended' && s.billingSuspension ? { reason: s.billingSuspension.reason, at: new Date(s.billingSuspension.at).toISOString() } : null,
    healthScore: s.healthScore ?? 100,
    ...(s.slugChangedAt ? { slugChangedAt: new Date(s.slugChangedAt).toISOString() } : {}),
    ...(business ? { business } : {}),
    ...(payout ? { payout } : {}),
    checklist: check,
    myRole: member.role,
    myPermissions,
    createdAt: new Date(s.createdAt).toISOString(),
  };
}

/** PATCH /seller/store — whitelisted fields only. */
export async function updateStore(req: Request, input: StoreUpdateInput): Promise<SellerStore> {
  const store = req.store!;
  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  const prefixes = [storePrefix(String(store._id)), tmpPrefix(req.user!.id)];

  assertStoreDesign(store, input); // plan: layout templates + section count (docs/api-billing.md §1)
  for (const key of ['name', 'tagline', 'description', 'themeColor', 'policies', 'seo', 'layoutTemplate', 'sections', 'holidayMode'] as const) {
    if (input[key] !== undefined) set[key] = input[key];
  }
  if (input.contact) for (const [k, v] of Object.entries(input.contact)) set[`contact.${k}`] = v;
  for (const key of ['logo', 'banner'] as const) {
    const v = input[key];
    if (v === null) unset[key] = 1;
    else if (v) {
      assertOwnedMedia(v, prefixes);
      set[key] = v;
    }
  }
  if (input.categoryIds) {
    set.categoryIds = await assertActiveCategories(input.categoryIds);
  }
  if (input.slug && input.slug !== store.slug) {
    if (store.slugChangedAt && Date.now() - store.slugChangedAt.getTime() < SLUG_CHANGE_INTERVAL_MS) {
      const next = new Date(store.slugChangedAt.getTime() + SLUG_CHANGE_INTERVAL_MS);
      throw new AppError(429, 'SLUG_CHANGE_TOO_SOON', 'You can change your store link once every 30 days', { nextChangeAt: next.toISOString() });
    }
    const check = await checkSlug(input.slug, { ignoreStoreId: String(store._id) });
    if (!check.available) throw new AppError(409, 'SLUG_UNAVAILABLE', 'This store link is not available', { reason: check.reason, ...(check.suggestion ? { suggestion: check.suggestion } : {}) });
    set.slug = input.slug;
    set.slugChangedAt = new Date();
  }

  try {
    await Store.updateOne({ _id: store._id }, { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new AppError(409, 'SLUG_UNAVAILABLE', 'This store link is not available', { reason: 'taken' });
    throw err;
  }
  invalidateStoreIndex();
  await audit({ action: 'store.updated', targetType: 'Store', targetId: store._id, meta: { fields: [...Object.keys(set), ...Object.keys(unset)] }, req });
  return getSellerStore(store._id, req.storeMember!);
}

/** A rejected store that fixes its KYC / payout goes back to the review queue. */
function reviewUpdate(status: string, set: Record<string, unknown>): { update: Record<string, unknown>; resubmitted: boolean } {
  if (status !== 'rejected') return { update: { $set: set }, resubmitted: false };
  return { update: { $set: { ...set, status: 'pending' }, $unset: { rejectionReason: 1 } }, resubmitted: true };
}

export async function updatePayout(req: Request, input: PayoutInput): Promise<SellerStore> {
  const store = req.store!;
  const { update, resubmitted } = reviewUpdate(store.status, { payout: sealPayout(input) });
  await Store.updateOne({ _id: store._id }, update);
  await audit({ action: 'store.payout_updated', targetType: 'Store', targetId: store._id, meta: { method: input.method, resubmitted }, req });
  return getSellerStore(store._id, req.storeMember!);
}

export async function updateBusiness(req: Request, input: BusinessInput): Promise<SellerStore> {
  const store = req.store!;
  assertOwnedMedia(input.idDocument, [storePrefix(String(store._id)), tmpPrefix(req.user!.id)]);
  const { update, resubmitted } = reviewUpdate(store.status, { business: sealBusiness(input) });
  await Store.updateOne({ _id: store._id }, update);
  await audit({ action: 'store.business_updated', targetType: 'Store', targetId: store._id, meta: { type: input.type, resubmitted }, req });
  return getSellerStore(store._id, req.storeMember!);
}

export async function requestMall(req: Request): Promise<SellerStore> {
  const store = req.store!;
  if (store.isMall) throw new AppError(409, 'ALREADY_MALL', 'Your store is already a Souqly Mall store');
  if (store.status !== 'approved') throw new AppError(409, 'STORE_NOT_APPROVED', 'Your store must be approved first');
  await Store.updateOne({ _id: store._id }, { $set: { mallRequested: true } });
  await audit({ action: 'store.mall_requested', targetType: 'Store', targetId: store._id, req });
  return getSellerStore(store._id, req.storeMember!);
}
