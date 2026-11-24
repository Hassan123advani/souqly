import {
  PERMISSIONS,
  PLATFORM_COMMISSION_BPS,
  adminReasonSchema,
  adminStoreCommissionSchema,
  adminStoreListQuerySchema,
  adminStoreMallSchema,
  adminStorePlanSchema,
  objectIdSchema,
} from '@souqly/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { AppError, notFound } from '../../lib/AppError';
import { asyncHandler } from '../../lib/asyncHandler';
import { streamCsv } from '../../lib/csv';
import { cursorFilter, cursorSort, paginate } from '../../lib/pagination';
import { escapeRegex } from '../../lib/text';
import { validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import { invalidateStoreIndex } from '../catalog/catalog.service';
import { CommissionRule } from '../commission/commission.model';
import { adminSetPlan } from '../billing/billing.service';
import { notify } from '../notifications/notification.service';
import { maskBusiness, maskPayout } from '../onboarding/sensitive';
import { Order } from '../orders/order.model';
import { Store } from '../stores/store.model';
import { StoreMember } from '../stores/storeMember.model';
import { User } from '../users/user.model';
import { listSort } from './common';
import { can, iso, oid, q } from './common';
import { GMV_EXCLUDED } from './dashboard.routes';

export const adminStoresAdminRouter = Router();
const idParams = z.object({ id: objectIdSchema });
type StoreListQuery = z.infer<typeof adminStoreListQuerySchema>;

function storeFilter(f: StoreListQuery): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (f.q) {
    const rx = { $regex: escapeRegex(f.q), $options: 'i' };
    filter.$or = [{ name: rx }, { slug: rx }];
  }
  if (f.status) filter.status = f.status;
  if (f.mall !== undefined) filter.isMall = f.mall;
  if (f.plan) filter.plan = f.plan;
  return filter;
}

const STORE_FIELDS = 'name slug status isMall mallRequested plan ownerId productCount ratingAvg followerCount createdAt approvedAt logo';
type StoreRow = { _id: unknown; name: string; slug: string; status: string; isMall: boolean; mallRequested: boolean; plan: string; ownerId: unknown; productCount: number; ratingAvg: number; followerCount: number; createdAt: Date; approvedAt?: Date; logo?: { url: string } };
const toRow = (s: StoreRow) => ({
  id: String(s._id),
  name: s.name,
  slug: s.slug,
  status: s.status,
  isMall: s.isMall,
  mallRequested: s.mallRequested,
  plan: s.plan,
  ownerId: String(s.ownerId),
  productCount: s.productCount,
  ratingAvg: s.ratingAvg,
  followerCount: s.followerCount,
  logo: s.logo?.url ?? null,
  createdAt: iso(s.createdAt),
  approvedAt: iso(s.approvedAt),
});

adminStoresAdminRouter.get(
  '/stores',
  ...can(PERMISSIONS.ADMIN_STORES_VIEW),
  validate({ query: adminStoreListQuerySchema }),
  asyncHandler(async (req, res) => {
    const f = q<StoreListQuery>(req);
    const srt = listSort(f.sort, { key: 'followers', field: 'followerCount' });
    if (f.format === 'csv') {
      await audit({ action: 'admin.export_csv', targetType: 'Store', meta: { resource: 'stores' }, req });
      const cursor = Store.find(storeFilter(f)).select(STORE_FIELDS).sort(cursorSort(srt.field, srt.dir)).lean<StoreRow[]>().cursor() as AsyncIterable<StoreRow>;
      return streamCsv(res, 'stores.csv', [
        { header: 'id', value: (s: StoreRow) => String(s._id) },
        { header: 'name', value: (s) => s.name },
        { header: 'slug', value: (s) => s.slug },
        { header: 'status', value: (s) => s.status },
        { header: 'isMall', value: (s) => s.isMall },
        { header: 'plan', value: (s) => s.plan },
        { header: 'productCount', value: (s) => s.productCount },
        { header: 'createdAt', value: (s) => s.createdAt },
      ], cursor);
    }
    const rows = await Store.find({ ...storeFilter(f), ...cursorFilter(srt.field, srt.dir, f.cursor) }).select(STORE_FIELDS).sort(cursorSort(srt.field, srt.dir)).limit(f.limit + 1).lean();
    const page = paginate(rows, f.limit, srt.field);
    res.json({ data: page.items.map((s) => toRow(s as unknown as StoreRow)), meta: { nextCursor: page.nextCursor } });
  }),
);

adminStoresAdminRouter.get(
  '/mall-requests',
  ...can(PERMISSIONS.ADMIN_STORES_VIEW),
  asyncHandler(async (_req, res) => {
    const rows = await Store.find({ mallRequested: true, isMall: false, status: 'approved' }).select(STORE_FIELDS).sort({ updatedAt: 1 }).limit(200).lean();
    res.json({ data: rows.map((s) => toRow(s as unknown as StoreRow)) });
  }),
);

adminStoresAdminRouter.get(
  '/stores/:id',
  ...can(PERMISSIONS.ADMIN_STORES_VIEW),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const s = await Store.findById(req.params.id).lean();
    if (!s) throw notFound('Store');
    const [owner, members, orderStats, commission] = await Promise.all([
      User.findById(s.ownerId).select('name email phone status').lean(),
      StoreMember.countDocuments({ storeId: s._id, status: 'active' }),
      Order.aggregate<{ gmv: number; orders: number }>([{ $match: { storeId: s._id, status: { $nin: GMV_EXCLUDED } } }, { $group: { _id: null, gmv: { $sum: '$total' }, orders: { $sum: 1 } } }]),
      CommissionRule.findOne({ scope: 'store', storeId: s._id }).lean(),
    ]);
    res.json({
      data: {
        ...toRow(s as unknown as StoreRow),
        tagline: s.tagline ?? null,
        description: s.description ?? null,
        contact: s.contact,
        address: s.address,
        rejectionReason: s.rejectionReason ?? null,
        suspension: s.suspension ? { reason: s.suspension.reason, at: iso(s.suspension.at) } : null,
        owner: owner ? { id: String(owner._id), name: owner.name, email: owner.email ?? null, phone: owner.phone ?? null, status: owner.status } : null,
        members,
        stats: { gmv: orderStats[0]?.gmv ?? 0, orders: orderStats[0]?.orders ?? 0 },
        // Retired per-store overrides are never applied (D-079); kept only for history.
        commissionOverrideBps: null,
        legacyCommissionOverrideBps: commission?.isActive ? commission.bps : null,
        commissionBps: PLATFORM_COMMISSION_BPS,
        billingStatus: s.billingStatus ?? 'active',
        billingSuspension: s.billingStatus === 'suspended' && s.billingSuspension ? { reason: s.billingSuspension.reason, at: iso(s.billingSuspension.at) } : null,
        hasBusinessInfo: !!s.business,
      },
    });
  }),
);

/** Masked business + payout info. Viewing it is audited (KYC data). */
adminStoresAdminRouter.get(
  '/stores/:id/business',
  ...can(PERMISSIONS.ADMIN_STORES_VIEW),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const s = await Store.findById(req.params.id).select('business payout pickupAddress').lean();
    if (!s) throw notFound('Store');
    await audit({ action: 'admin.store_business_viewed', targetType: 'Store', targetId: s._id, storeId: s._id, req });
    res.json({ data: { business: maskBusiness(s.business as never) ?? null, payout: maskPayout(s.payout as never) ?? null, pickupAddress: s.pickupAddress ?? null } });
  }),
);

async function notifyOwner(storeId: unknown, title: string, body: string) {
  const s = await Store.findById(storeId).select('ownerId').lean();
  if (s) void notify({ userId: s.ownerId, type: 'store.admin_update', title, body, link: '/seller' });
}

async function setStoreFields(req: Request, filter: Record<string, unknown>, update: Record<string, unknown>, action: string, meta: Record<string, unknown> = {}) {
  const s = await Store.findOneAndUpdate({ _id: oid(req.params.id!), ...filter }, update, { new: true }).lean();
  if (!s) {
    if (!(await Store.exists({ _id: oid(req.params.id!) }))) throw notFound('Store');
    throw new AppError(409, 'INVALID_STORE_STATE', 'The store is not in a state that allows this action');
  }
  invalidateStoreIndex();
  await audit({ action, targetType: 'Store', targetId: s._id, storeId: s._id, meta, req });
  return s;
}

adminStoresAdminRouter.post(
  '/stores/:id/suspend',
  ...can(PERMISSIONS.ADMIN_STORES_MANAGE),
  validate({ params: idParams, body: adminReasonSchema }),
  asyncHandler(async (req, res) => {
    const s = await setStoreFields(req, { status: 'approved' }, { $set: { status: 'suspended', suspension: { reason: req.body.reason, at: new Date(), by: oid(req.user!.id) } } }, 'admin.store_suspended', { reason: req.body.reason });
    await notifyOwner(s._id, 'Your store was suspended', `Reason: ${req.body.reason}`);
    res.json({ data: { id: String(s._id), status: s.status } });
  }),
);

adminStoresAdminRouter.post(
  '/stores/:id/unsuspend',
  ...can(PERMISSIONS.ADMIN_STORES_MANAGE),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const s = await setStoreFields(req, { status: 'suspended' }, { $set: { status: 'approved' }, $unset: { suspension: 1 } }, 'admin.store_unsuspended');
    await notifyOwner(s._id, 'Your store is live again', 'The suspension on your store was lifted.');
    res.json({ data: { id: String(s._id), status: s.status } });
  }),
);

adminStoresAdminRouter.patch(
  '/stores/:id/mall',
  ...can(PERMISSIONS.ADMIN_STORES_MANAGE),
  validate({ params: idParams, body: adminStoreMallSchema }),
  asyncHandler(async (req, res) => {
    const s = await setStoreFields(req, {}, { $set: { isMall: req.body.isMall, mallRequested: false } }, req.body.isMall ? 'admin.store_mall_granted' : 'admin.store_mall_removed');
    res.json({ data: { id: String(s._id), isMall: s.isMall } });
  }),
);

adminStoresAdminRouter.patch(
  '/stores/:id/plan',
  ...can(PERMISSIONS.ADMIN_STORES_MANAGE),
  validate({ params: idParams, body: adminStorePlanSchema }),
  asyncHandler(async (req, res) => {
    // Routed through billing so the subscription and an adjustment record stay consistent (docs/api-billing.md §8).
    const storeId = oid(req.params.id!);
    if (!(await Store.exists({ _id: storeId }))) throw notFound('Store');
    const sub = await adminSetPlan(req, storeId, req.body.plan, 'Admin plan change');
    res.json({ data: { id: String(storeId), plan: sub.plan } });
  }),
);

adminStoresAdminRouter.put(
  '/stores/:id/commission',
  ...can(PERMISSIONS.ADMIN_STORES_MANAGE),
  validate({ params: idParams, body: adminStoreCommissionSchema }),
  asyncHandler(async (req) => {
    // Commission is a flat platform rate (D-079): per-store overrides are retired.
    if (!(await Store.exists({ _id: oid(req.params.id!) }))) throw notFound('Store');
    throw new AppError(409, 'COMMISSION_FIXED', `Commission is a flat ${PLATFORM_COMMISSION_BPS / 100}% on every sale for every plan`, { commissionBps: PLATFORM_COMMISSION_BPS });
  }),
);
