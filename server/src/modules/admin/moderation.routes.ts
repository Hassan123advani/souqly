import { PERMISSIONS, adminListQuerySchema, adminReportListQuerySchema, adminReportResolveSchema, adminReviewListQuerySchema, objectIdSchema } from '@souqly/shared';
import { Router, type Request } from 'express';
import type { Types } from 'mongoose';
import { z } from 'zod';
import { AppError, notFound } from '../../lib/AppError';
import { asyncHandler } from '../../lib/asyncHandler';
import { streamCsv } from '../../lib/csv';
import { cursorFilter, cursorSort, paginate } from '../../lib/pagination';
import { validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import { invalidateStoreIndex } from '../catalog/catalog.service';
import { Product } from '../catalog/product.model';
import { Message } from '../chat/chat.models';
import { FraudSignal, Report } from '../reports/report.model';
import { Review, type ReviewLean } from '../reviews/review.model';
import { recomputeRatings } from '../reviews/review.service';
import { Store } from '../stores/store.model';
import { can, iso, oid, q } from './common';

export const adminModerationRouter = Router();
const idParams = z.object({ id: objectIdSchema });
const MOD = PERMISSIONS.ADMIN_REVIEWS_MODERATE;

// ---------------- reviews ----------------
type ReviewQuery = z.infer<typeof adminReviewListQuerySchema>;
const reviewFilter = (f: ReviewQuery) => ({ ...(f.status ? { status: f.status } : {}), ...(f.storeId ? { storeId: oid(f.storeId) } : {}) });
const reviewDTO = (r: ReviewLean) => ({
  id: String(r._id),
  productId: String(r.productId),
  storeId: String(r.storeId),
  buyerId: String(r.buyerId),
  rating: r.rating,
  title: r.title ?? null,
  body: r.body ?? null,
  media: r.media.map((m) => ({ type: m.type, url: m.url })),
  verified: r.verified,
  status: r.status,
  flags: r.flags,
  reportCount: r.reportCount,
  createdAt: iso(r.createdAt),
});

adminModerationRouter.get(
  '/reviews',
  ...can(MOD),
  validate({ query: adminReviewListQuerySchema }),
  asyncHandler(async (req, res) => {
    const f = q<ReviewQuery>(req);
    if (f.format === 'csv') {
      await audit({ action: 'admin.export_csv', targetType: 'Review', meta: { resource: 'reviews' }, req });
      const cursor = Review.find(reviewFilter(f)).sort({ _id: -1 }).lean<ReviewLean[]>().cursor() as AsyncIterable<ReviewLean>;
      return streamCsv(res, 'reviews.csv', [
        { header: 'id', value: (r: ReviewLean) => String(r._id) },
        { header: 'productId', value: (r) => String(r.productId) },
        { header: 'storeId', value: (r) => String(r.storeId) },
        { header: 'rating', value: (r) => r.rating },
        { header: 'title', value: (r) => r.title },
        { header: 'body', value: (r) => r.body },
        { header: 'status', value: (r) => r.status },
        { header: 'reportCount', value: (r) => r.reportCount },
        { header: 'createdAt', value: (r) => r.createdAt },
      ], cursor);
    }
    const rows = await Review.find({ ...reviewFilter(f), ...cursorFilter('_id', -1, f.cursor) }).sort(cursorSort('_id', -1)).limit(f.limit + 1).lean<ReviewLean[]>();
    const page = paginate(rows, f.limit, '_id');
    res.json({ data: page.items.map(reviewDTO), meta: { nextCursor: page.nextCursor } });
  }),
);

async function setReviewStatus(req: Request, id: string, status: 'hidden' | 'published', action: string) {
  const r = await Review.findByIdAndUpdate(id, { $set: { status } }, { new: true }).lean<ReviewLean>();
  if (!r) throw notFound('Review');
  await recomputeRatings(r.productId, r.storeId);
  await audit({ action, targetType: 'Review', targetId: r._id, storeId: r.storeId, req });
  return reviewDTO(r);
}

adminModerationRouter.post(
  '/reviews/:id/hide',
  ...can(MOD),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.json({ data: await setReviewStatus(req, req.params.id!, 'hidden', 'admin.review_hidden') });
  }),
);

adminModerationRouter.post(
  '/reviews/:id/restore',
  ...can(MOD),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.json({ data: await setReviewStatus(req, req.params.id!, 'published', 'admin.review_restored') });
  }),
);

adminModerationRouter.delete(
  '/reviews/:id',
  ...can(MOD),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const r = await Review.findByIdAndDelete(req.params.id).lean<ReviewLean>();
    if (!r) throw notFound('Review');
    await recomputeRatings(r.productId, r.storeId);
    await audit({ action: 'admin.review_deleted', targetType: 'Review', targetId: r._id, storeId: r.storeId, meta: { rating: r.rating, buyerId: String(r.buyerId) }, req });
    res.status(204).end();
  }),
);

// ---------------- reports ----------------
type ReportQuery = z.infer<typeof adminReportListQuerySchema>;

adminModerationRouter.get(
  '/reports',
  ...can(MOD),
  validate({ query: adminReportListQuerySchema }),
  asyncHandler(async (req, res) => {
    const f = q<ReportQuery>(req);
    const rows = await Report.find({ ...(f.status ? { status: f.status } : {}), ...cursorFilter('_id', -1, f.cursor) }).sort(cursorSort('_id', -1)).limit(f.limit + 1).lean();
    const page = paginate(rows, f.limit, '_id');
    res.json({
      data: page.items.map((r) => ({
        id: String(r._id),
        reporterId: String(r.reporterId),
        targetType: r.targetType,
        targetId: String(r.targetId),
        storeId: r.storeId ? String(r.storeId) : null,
        reason: r.reason,
        details: r.details ?? null,
        status: r.status,
        resolution: r.resolution ? { by: String(r.resolution.by), at: iso(r.resolution.at), note: r.resolution.note ?? null } : null,
        createdAt: iso(r.createdAt),
      })),
      meta: { nextCursor: page.nextCursor },
    });
  }),
);

/** Takes the reported content down. Returns false when the target no longer exists. */
async function hideTarget(req: Request, type: string, id: Types.ObjectId, note: string): Promise<boolean> {
  if (type === 'review') {
    const r = await Review.findByIdAndUpdate(id, { $set: { status: 'hidden' } }).lean<ReviewLean>();
    if (r) await recomputeRatings(r.productId, r.storeId);
    return !!r;
  }
  if (type === 'product') {
    const p = await Product.findOneAndUpdate({ _id: id, status: { $in: ['published', 'pending_review'] } }, { $set: { status: 'rejected', moderationNote: note, isFeatured: false } }).lean();
    if (p?.status === 'published') {
      await Store.updateOne({ _id: p.storeId, productCount: { $gt: 0 } }, { $inc: { productCount: -1 } });
      invalidateStoreIndex();
    }
    return !!p;
  }
  if (type === 'store') {
    const s = await Store.findOneAndUpdate({ _id: id, status: 'approved' }, { $set: { status: 'suspended', suspension: { reason: note, at: new Date(), by: oid(req.user!.id) } } }).lean();
    invalidateStoreIndex();
    return !!s;
  }
  if (type === 'message') {
    const m = await Message.findByIdAndUpdate(id, { $set: { text: '[Removed by Souqly]' }, $unset: { imageUrl: 1, card: 1 } }).lean();
    return !!m;
  }
  return false;
}

adminModerationRouter.post(
  '/reports/:id/resolve',
  ...can(MOD),
  validate({ params: idParams, body: adminReportResolveSchema }),
  asyncHandler(async (req, res) => {
    const { action, note } = req.body as z.infer<typeof adminReportResolveSchema>;
    const r = await Report.findOneAndUpdate(
      { _id: oid(req.params.id!), status: { $in: ['open', 'reviewing'] } },
      { $set: { status: action === 'dismiss' ? 'dismissed' : 'resolved', resolution: { by: oid(req.user!.id), at: new Date(), ...(note ? { note } : {}) } } },
      { new: true },
    ).lean();
    if (!r) {
      if (!(await Report.exists({ _id: oid(req.params.id!) }))) throw notFound('Report');
      throw new AppError(409, 'REPORT_CLOSED', 'This report was already handled');
    }
    let targetHidden = false;
    if (action === 'hide_target') {
      targetHidden = await hideTarget(req, r.targetType, r.targetId, note ?? `Removed after a report (${r.reason})`);
      // Every other open report on the same target is resolved with it.
      await Report.updateMany({ targetType: r.targetType, targetId: r.targetId, status: { $in: ['open', 'reviewing'] } }, { $set: { status: 'resolved', resolution: { by: oid(req.user!.id), at: new Date(), note: 'Target removed' } } });
    }
    await audit({ action: 'admin.report_resolved', targetType: 'Report', targetId: r._id, meta: { action, note, target: `${r.targetType}:${String(r.targetId)}`, targetHidden }, req });
    res.json({ data: { id: String(r._id), status: r.status, targetHidden } });
  }),
);

// ---------------- fraud signals ----------------
const fraudQuery = adminListQuerySchema.extend({ status: z.enum(['open', 'cleared', 'actioned']).default('open') });

adminModerationRouter.get(
  '/fraud-signals',
  ...can(MOD),
  validate({ query: fraudQuery }),
  asyncHandler(async (req, res) => {
    const f = q<z.infer<typeof fraudQuery>>(req);
    const rows = await FraudSignal.find({ status: f.status, ...cursorFilter('_id', -1, f.cursor) }).sort(cursorSort('_id', -1)).limit(f.limit + 1).lean();
    const page = paginate(rows, f.limit, '_id');
    res.json({
      data: page.items.map((s) => ({ id: String(s._id), type: s.type, refType: s.refType, refId: String(s.refId), score: s.score, details: s.details ?? {}, status: s.status, createdAt: iso(s.createdAt) })),
      meta: { nextCursor: page.nextCursor },
    });
  }),
);

for (const [path, status] of [['dismiss', 'cleared'], ['action', 'actioned']] as const) {
  adminModerationRouter.post(
    `/fraud-signals/:id/${path}`,
    ...can(MOD),
    validate({ params: idParams }),
    asyncHandler(async (req, res) => {
      const s = await FraudSignal.findOneAndUpdate({ _id: oid(req.params.id!), status: 'open' }, { $set: { status } }, { new: true }).lean();
      if (!s) throw new AppError(409, 'SIGNAL_CLOSED', 'This signal is not open');
      await audit({ action: `admin.fraud_signal_${status}`, targetType: 'FraudSignal', targetId: s._id, meta: { type: s.type, ref: `${s.refType}:${String(s.refId)}` }, req });
      res.json({ data: { id: String(s._id), status: s.status } });
    }),
  );
}
