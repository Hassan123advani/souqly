import { PLANS, PLATFORM_COMMISSION_BPS, normalizePlan, requiredPlanFor, type PlanFeature, type StoreLayout, type StorePlan } from '@souqly/shared';
import type { Request, RequestHandler } from 'express';
import { Schema, Types, model } from 'mongoose';
import { AppError, notFound } from '../../lib/AppError';
import { audit } from '../audit/audit.service';
import { Product } from '../catalog/product.model';
import { Store } from '../stores/store.model';
import { StoreMember } from '../stores/storeMember.model';

/**
 * Seller plan limits (docs/api-billing.md §1). Limits come from the shared PLANS constant. Paid upgrades go
 * through billing (`/seller/billing/change-plan`); PlanRequest is the legacy "comp request" path (admin approval
 * changes the plan without an invoice, recorded as a billing adjustment).
 */

export interface IPlanRequest {
  storeId: Types.ObjectId;
  from: StorePlan;
  plan: StorePlan;
  status: 'pending' | 'approved' | 'rejected';
  note?: string;
  reviewNote?: string;
  requestedBy: Types.ObjectId;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}
const planRequestSchema = new Schema<IPlanRequest>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    from: { type: String, required: true },
    plan: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    note: { type: String, maxlength: 500 },
    reviewNote: { type: String, maxlength: 500 },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    demo: { type: Boolean, default: false },
  },
  { timestamps: true },
);
planRequestSchema.index({ storeId: 1, createdAt: -1 });
planRequestSchema.index({ status: 1, createdAt: -1 });
// At most one pending request per store.
planRequestSchema.index({ storeId: 1 }, { unique: true, partialFilterExpression: { status: 'pending' }, name: 'one_pending_per_store' });
export const PlanRequest = model<IPlanRequest>('PlanRequest', planRequestSchema);

const planOf = (store: { plan?: StorePlan | string }) => PLANS[normalizePlan(store.plan)];

const planLimit = (plan: StorePlan, details: Record<string, unknown>, message: string) =>
  new AppError(403, 'PLAN_LIMIT', message, { plan, ...details });

/** Middleware: 403 PLAN_LIMIT unless the acting store's plan includes `feature`. Run after storeContext. */
export function requirePlanFeature(feature: PlanFeature): RequestHandler {
  return (req, _res, next) => {
    const p = planOf(req.store!);
    if (p.features[feature]) return next();
    next(planLimit(p.id, { feature, requiredPlan: requiredPlanFor(feature) }, `Your ${p.name} plan does not include this feature. Upgrade to use it.`));
  };
}

export function hasPlanFeature(store: { plan?: StorePlan }, feature: PlanFeature): boolean {
  return planOf(store).features[feature];
}

/** Throws 403 PLAN_LIMIT when the store's plan lacks `feature`. */
export function assertPlanFeature(store: { plan?: StorePlan }, feature: PlanFeature): void {
  const p = planOf(store);
  if (!p.features[feature]) throw planLimit(p.id, { feature, requiredPlan: requiredPlanFor(feature) }, `Your ${p.name} plan does not include this feature. Upgrade to use it.`);
}

/**
 * Publishing: live products (published + in review) must stay within the plan limit. After a downgrade
 * nothing is unpublished or deleted, but new publishes beyond the limit are refused.
 */
export async function assertLiveProductLimit(store: { _id: Types.ObjectId; plan?: StorePlan }): Promise<void> {
  const p = planOf(store);
  if (p.limits.products === null) return;
  const live = await Product.countDocuments({ storeId: store._id, deletedAt: { $exists: false }, status: { $in: ['published', 'pending_review'] } });
  if (live + 1 > p.limits.products) {
    throw planLimit(p.id, { limit: 'liveProducts', used: live, max: p.limits.products, requiredPlan: p.id === 'free' ? 'pro' : 'premium' }, `Your ${p.name} plan allows up to ${p.limits.products} live products. Upgrade to publish more.`);
  }
}

/** Store page builder: layout template and section count must be allowed by the plan (checked only when changed). */
export function assertStoreDesign(store: { plan?: StorePlan; layoutTemplate?: StoreLayout; sections?: unknown[] }, input: { layoutTemplate?: StoreLayout; sections?: unknown[] }): void {
  const p = planOf(store);
  if (input.layoutTemplate && input.layoutTemplate !== store.layoutTemplate && !p.layouts.includes(input.layoutTemplate)) {
    throw planLimit(p.id, { feature: 'layoutTemplates', requiredPlan: requiredPlanFor('layoutTemplates') }, `The ${input.layoutTemplate} layout needs the Pro plan.`);
  }
  const before = store.sections?.length ?? 0;
  if (input.sections && input.sections.length > p.limits.storeSections && input.sections.length > before) {
    throw planLimit(p.id, { limit: 'storeSections', used: input.sections.length, max: p.limits.storeSections, requiredPlan: p.id === 'free' ? 'pro' : 'premium' }, `Your ${p.name} plan allows up to ${p.limits.storeSections} store sections.`);
  }
}

/** Throws PLAN_LIMIT if adding `adding` products would exceed the plan's product limit (soft-deleted excluded). */
export async function assertProductLimit(store: { _id: Types.ObjectId; plan?: StorePlan }, adding = 1): Promise<void> {
  const p = planOf(store);
  if (p.limits.products === null) return;
  const used = await Product.countDocuments({ storeId: store._id, deletedAt: { $exists: false } });
  if (used + adding > p.limits.products) {
    throw planLimit(p.id, { limit: 'products', used, max: p.limits.products }, `Your ${p.name} plan allows up to ${p.limits.products} products. Upgrade to add more.`);
  }
}

/** Non-owner members (incl. pending invites) count toward the staff limit. */
export async function assertStaffLimit(store: { _id: Types.ObjectId; plan?: StorePlan }): Promise<void> {
  const p = planOf(store);
  const used = await StoreMember.countDocuments({ storeId: store._id, role: { $ne: 'OWNER' } });
  if (used + 1 > p.limits.staff) {
    throw planLimit(p.id, { limit: 'staff', used, max: p.limits.staff }, `Your ${p.name} plan allows up to ${p.limits.staff} team members. Upgrade to invite more.`);
  }
}

export async function planSummary(store: { _id: Types.ObjectId; plan?: StorePlan }) {
  const p = planOf(store);
  const [products, staff, pending] = await Promise.all([
    Product.countDocuments({ storeId: store._id, deletedAt: { $exists: false } }),
    StoreMember.countDocuments({ storeId: store._id, role: { $ne: 'OWNER' } }),
    PlanRequest.findOne({ storeId: store._id, status: 'pending' }).lean(),
  ]);
  return {
    plan: p.id,
    definition: p,
    commissionBps: PLATFORM_COMMISSION_BPS,
    usage: { products, staff },
    plans: Object.values(PLANS),
    pendingRequest: pending ? { id: String(pending._id), plan: pending.plan, createdAt: pending.createdAt.toISOString() } : null,
  };
}

export async function requestPlan(req: Request, plan: StorePlan, note?: string) {
  const store = req.store!;
  if ((store.plan ?? 'free') === plan) throw new AppError(409, 'ALREADY_ON_PLAN', 'Your store is already on this plan');
  try {
    const r = await PlanRequest.create({ storeId: store._id, from: store.plan ?? 'free', plan, ...(note ? { note } : {}), requestedBy: new Types.ObjectId(req.user!.id) });
    await audit({ action: 'store.plan_requested', targetType: 'Store', targetId: store._id, meta: { from: store.plan ?? 'free', plan }, req });
    return { id: String(r._id), plan: r.plan, status: r.status, createdAt: r.createdAt.toISOString() };
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new AppError(409, 'REQUEST_PENDING', 'You already have a pending plan request');
    throw err;
  }
}

export async function listPlanRequests(status?: string) {
  const rows = await PlanRequest.find(status ? { status } : {}).sort({ createdAt: -1 }).limit(200).lean();
  const names = new Map((await Store.find({ _id: { $in: rows.map((r) => r.storeId) } }).select('name slug').lean()).map((s) => [String(s._id), s]));
  return rows.map((r) => ({
    id: String(r._id),
    store: { id: String(r.storeId), name: names.get(String(r.storeId))?.name ?? '', slug: names.get(String(r.storeId))?.slug ?? '' },
    from: r.from,
    plan: r.plan,
    status: r.status,
    note: r.note ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function reviewPlanRequest(req: Request, id: string, status: 'approved' | 'rejected', note?: string) {
  const r = await PlanRequest.findOneAndUpdate(
    { _id: new Types.ObjectId(id), status: 'pending' },
    { $set: { status, reviewedBy: new Types.ObjectId(req.user!.id), reviewedAt: new Date(), ...(note ? { reviewNote: note } : {}) } },
    { new: true },
  ).lean();
  if (!r) throw notFound('Pending plan request');
  if (status === 'approved') {
    // Comped plan change through billing (subscription + store + adjustment record).
    const { adminSetPlan } = await import('../billing/billing.service');
    await adminSetPlan(req, r.storeId, normalizePlan(r.plan), note ?? `Plan request approved (${r.from} → ${r.plan})`);
  }
  await audit({ action: `admin.plan_request_${status}`, targetType: 'Store', targetId: r.storeId, meta: { plan: r.plan, from: r.from }, req });
  return { id, status, plan: r.plan };
}
