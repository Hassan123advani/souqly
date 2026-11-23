import type { PendingReviewDTO, ReviewCreateInput, ReviewDTO, ReviewListQuery, ReviewSummaryDTO } from '@souqly/shared';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { cursorFilter, cursorSort, paginate } from '../../lib/pagination';
import { stripHtml } from '../../lib/sanitize';
import { audit } from '../audit/audit.service';
import { Session } from '../auth/session.model';
import { Product } from '../catalog/product.model';
import { notifySafe } from '../chat/notifyAdapter';
import { Order, type OrderLean } from '../orders/order.model';
import { FraudSignal } from '../reports/report.model';
import { Store } from '../stores/store.model';
import { User } from '../users/user.model';
import { maskBadWords } from './badWords';
import { resolveOwnUploads } from './media';
import { Review, ReviewVote, type ReviewLean } from './review.model';

const oid = (s: string | Types.ObjectId) => new Types.ObjectId(String(s));

/** Statuses that prove the order was delivered (later return steps still count). */
export const REVIEWABLE_ORDER_STATUSES = ['delivered', 'return_requested', 'returned', 'refunded'] as const;
/** Reports that move a published review to moderation. */
const REPORT_HIDE_THRESHOLD = 5;

const SORTS = {
  recent: { field: '_id', dir: -1 },
  helpful: { field: 'helpfulCount', dir: -1 },
  rating_high: { field: 'rating', dir: -1 },
  rating_low: { field: 'rating', dir: 1 },
} as const;

/** Plain text, bad words masked. */
export function cleanText(input: string | undefined): { text?: string; flagged: boolean } {
  if (!input) return { flagged: false };
  const plain = stripHtml(input);
  if (!plain) return { flagged: false };
  const m = maskBadWords(plain);
  return { text: m.text, flagged: m.flagged };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Recomputes Product and Store rating aggregates from published reviews. */
export async function recomputeRatings(productId: Types.ObjectId, storeId: Types.ObjectId): Promise<void> {
  const [p] = await Review.aggregate<{ avg: number; count: number }>([
    { $match: { productId, status: 'published' } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  await Product.updateOne({ _id: productId }, { $set: { ratingAvg: round2(p?.avg ?? 0), ratingCount: p?.count ?? 0 } });
  const [s] = await Review.aggregate<{ avg: number; count: number }>([
    { $match: { storeId, status: 'published' } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  await Store.updateOne({ _id: storeId }, { $set: { ratingAvg: round2(s?.avg ?? 0), ratingCount: s?.count ?? 0 } });
}

async function authors(ids: Types.ObjectId[]) {
  const users = await User.find({ _id: { $in: ids } }).select('name avatar preferences.privacy').lean();
  return new Map(
    users.map((u) => {
      const show = u.preferences?.privacy?.showProfileInReviews !== false;
      const first = (u.name ?? 'Buyer').trim();
      const name = show ? first : `${first[0] ?? 'B'}***`;
      return [String(u._id), { name, ...(show && u.avatar?.url ? { avatar: u.avatar.url } : {}) }];
    }),
  );
}

export function toReviewDTO(r: ReviewLean, author: { name: string; avatar?: string } | undefined, extra: Partial<ReviewDTO> = {}): ReviewDTO {
  return {
    id: String(r._id),
    productId: String(r.productId),
    author: author ?? { name: 'Buyer' },
    rating: r.rating,
    ...(r.title ? { title: r.title } : {}),
    ...(r.body ? { body: r.body } : {}),
    ...(r.variantLabel ? { variantLabel: r.variantLabel } : {}),
    media: r.media.map((m) => ({ type: m.type, url: m.url })),
    verified: r.verified,
    status: r.status,
    helpfulCount: r.helpfulCount,
    ...(r.reply ? { reply: { text: r.reply.text, at: r.reply.at.toISOString() } } : {}),
    createdAt: r.createdAt.toISOString(),
    ...extra,
  };
}

async function publishedProductBySlug(slug: string) {
  const p = await Product.findOne({ slug, status: 'published', deletedAt: { $exists: false } }).select('_id storeId title slug').lean();
  if (!p) throw new AppError(404, 'NOT_FOUND', 'Product not found');
  return p;
}

export async function listProductReviews(slug: string, q: ReviewListQuery, viewerId?: string) {
  const product = await publishedProductBySlug(slug);
  const { field, dir } = SORTS[q.sort];
  const filter = {
    productId: product._id,
    status: 'published',
    ...(q.rating ? { rating: q.rating } : {}),
    ...(q.withMedia ? { hasMedia: true } : {}),
    ...cursorFilter(field, dir, q.cursor),
  };
  const rows = await Review.find(filter).sort(cursorSort(field, dir)).limit(q.limit + 1).lean<ReviewLean[]>();
  const page = paginate(rows, q.limit, field);
  const [names, votes] = await Promise.all([
    authors(page.items.map((r) => r.buyerId)),
    viewerId ? ReviewVote.find({ userId: oid(viewerId), reviewId: { $in: page.items.map((r) => r._id) } }).select('reviewId').lean() : Promise.resolve([]),
  ]);
  const voted = new Set(votes.map((v) => String(v.reviewId)));
  return {
    items: page.items.map((r) => toReviewDTO(r, names.get(String(r.buyerId)), viewerId ? { myVote: voted.has(String(r._id)) } : {})),
    nextCursor: page.nextCursor,
  };
}

export async function reviewSummary(slug: string): Promise<ReviewSummaryDTO> {
  const product = await publishedProductBySlug(slug);
  const rows = await Review.aggregate<{ _id: number; n: number; media: number; sum: number }>([
    { $match: { productId: product._id, status: 'published' } },
    { $group: { _id: '$rating', n: { $sum: 1 }, media: { $sum: { $cond: ['$hasMedia', 1, 0] } }, sum: { $sum: '$rating' } } },
  ]);
  const breakdown = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } as ReviewSummaryDTO['breakdown'];
  let count = 0;
  let sum = 0;
  let withMedia = 0;
  for (const r of rows) {
    breakdown[String(r._id) as keyof typeof breakdown] = r.n;
    count += r.n;
    sum += r.sum;
    withMedia += r.media;
  }
  return { avg: count ? round2(sum / count) : 0, count, breakdown, withMedia };
}

// ---------------- Create ----------------
export function isPrivateIp(ip: string): boolean {
  const v4 = ip.replace(/^::ffff:/, '');
  return ip === '::1' || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(v4) || /^f[cd]/i.test(ip);
}

async function fraudChecks(review: ReviewLean, userCreatedAt: Date, ip: string | undefined): Promise<boolean> {
  const signals: { type: string; score: number; details: Record<string, unknown> }[] = [];
  const ageMs = Date.now() - userCreatedAt.getTime();
  if (ageMs < 24 * 60 * 60_000) signals.push({ type: 'new_account_review', score: 40, details: { accountAgeHours: Math.round(ageMs / 3_600_000) } });
  const recent = await Review.countDocuments({ buyerId: review.buyerId, createdAt: { $gte: new Date(Date.now() - 60 * 60_000) } });
  if (recent >= 5) signals.push({ type: 'review_burst', score: 50, details: { reviewsLastHour: recent } });
  let ownerIp = false;
  // Loopback / private addresses (dev, tests, proxies without TRUST_PROXY) say nothing about who is behind them.
  if (ip && !isPrivateIp(ip)) {
    const store = await Store.findById(review.storeId).select('ownerId').lean();
    if (store && String(store.ownerId) !== String(review.buyerId)) {
      ownerIp = !!(await Session.exists({ userId: store.ownerId, ip }));
      if (ownerIp) signals.push({ type: 'owner_ip_review', score: 80, details: { storeId: String(review.storeId) } });
    }
  }
  for (const s of signals) {
    await FraudSignal.updateOne(
      { refType: 'Review', refId: review._id, type: s.type },
      { $setOnInsert: { score: s.score, details: { ...s.details, buyerId: String(review.buyerId), productId: String(review.productId) }, status: 'open' } },
      { upsert: true },
    );
  }
  return ownerIp;
}

export async function createReview(req: Request, input: ReviewCreateInput): Promise<ReviewDTO> {
  const userId = req.user!.id;
  const order = await Order.findOne({ _id: oid(input.orderId), buyerId: oid(userId) }).lean<OrderLean>();
  if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found');
  if (!(REVIEWABLE_ORDER_STATUSES as readonly string[]).includes(order.status)) {
    throw new AppError(400, 'NOT_DELIVERED', 'You can review an item after it has been delivered');
  }
  const item = order.items.find((i) => String(i.productId) === input.productId && String(i.variantId) === input.variantId);
  if (!item) throw new AppError(400, 'NOT_IN_ORDER', 'This item is not part of the order');
  if (await Review.exists({ orderId: order._id, productId: item.productId, variantId: item.variantId })) {
    throw new AppError(409, 'ALREADY_REVIEWED', 'You have already reviewed this item');
  }

  const title = cleanText(input.title);
  const body = cleanText(input.body);
  const media = input.media ?? [];
  const urls = await resolveOwnUploads(userId, media.map((m) => ({ key: m.key, kind: m.type === 'video' ? 'review_video' : 'review_image' })));
  const user = await User.findById(oid(userId)).select('createdAt').lean();
  const flags = title.flagged || body.flagged ? ['bad_words'] : [];
  const options = (item.options ?? {}) as Record<string, string>;
  const variantLabel = Object.entries(options).map(([k, v]) => `${k}: ${v}`).join(', ').slice(0, 200);

  let review;
  try {
    review = await Review.create({
      productId: item.productId,
      storeId: order.storeId,
      orderId: order._id,
      variantId: item.variantId,
      buyerId: oid(userId),
      rating: input.rating,
      ...(title.text ? { title: title.text.slice(0, 120) } : {}),
      ...(body.text ? { body: body.text.slice(0, 3000) } : {}),
      ...(variantLabel ? { variantLabel } : {}),
      media: media.map((m) => ({ type: m.type, key: m.key, url: urls.get(m.key)! })),
      hasMedia: media.length > 0,
      verified: true,
      status: flags.length ? 'pending' : 'published',
      flags,
      ...(req.ip ? { ip: req.ip } : {}),
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new AppError(409, 'ALREADY_REVIEWED', 'You have already reviewed this item');
    throw err;
  }
  const lean = review.toObject() as ReviewLean;
  try {
    const ownerIp = await fraudChecks(lean, user?.createdAt ?? new Date(), req.ip);
    if (ownerIp && lean.status === 'published') {
      await Review.updateOne({ _id: lean._id }, { $set: { status: 'pending' }, $addToSet: { flags: 'fraud' } });
      lean.status = 'pending';
    }
  } catch (err) {
    logger.warn({ err }, 'Review fraud checks failed');
  }
  if (lean.status === 'published') await recomputeRatings(lean.productId, lean.storeId);
  await audit({ action: 'review.created', req, targetType: 'Review', targetId: lean._id, meta: { productId: String(lean.productId), rating: lean.rating, status: lean.status } });
  const names = await authors([lean.buyerId]);
  return toReviewDTO(lean, names.get(userId));
}

export async function myReviews(userId: string, q: { cursor?: string; limit: number }) {
  const rows = await Review.find({ buyerId: oid(userId), ...cursorFilter('_id', -1, q.cursor) }).sort(cursorSort('_id', -1)).limit(q.limit + 1).lean<ReviewLean[]>();
  const page = paginate(rows, q.limit, '_id');
  const products = await Product.find({ _id: { $in: page.items.map((r) => r.productId) } }).select('title slug images').lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const names = await authors([oid(userId)]);
  return {
    items: page.items.map((r) => {
      const p = byId.get(String(r.productId));
      return toReviewDTO(r, names.get(userId), p ? { product: { title: p.title, slug: p.slug, ...(p.images?.[0]?.url ? { image: p.images[0].url } : {}) } } : {});
    }),
    nextCursor: page.nextCursor,
  };
}

/** Delivered order items without a review yet (review reminders), newest first. */
export async function pendingReviews(userId: string): Promise<PendingReviewDTO[]> {
  const orders = await Order.find({ buyerId: oid(userId), status: { $in: REVIEWABLE_ORDER_STATUSES } })
    .sort({ createdAt: -1 })
    .limit(50)
    .select('number items timeline')
    .lean<OrderLean[]>();
  if (!orders.length) return [];
  const reviewed = await Review.find({ orderId: { $in: orders.map((o) => o._id) } }).select('orderId productId variantId').lean();
  const done = new Set(reviewed.map((r) => `${r.orderId}:${r.productId}:${r.variantId}`));
  const out: PendingReviewDTO[] = [];
  for (const o of orders) {
    const deliveredAt = [...o.timeline].reverse().find((t) => t.status === 'delivered')?.at;
    for (const it of o.items) {
      if (done.has(`${o._id}:${it.productId}:${it.variantId}`)) continue;
      out.push({
        orderId: String(o._id),
        orderNumber: o.number,
        productId: String(it.productId),
        variantId: String(it.variantId),
        title: it.title,
        ...(it.slug ? { slug: it.slug } : {}),
        ...(it.image ? { image: it.image } : {}),
        options: (it.options ?? {}) as Record<string, string>,
        ...(deliveredAt ? { deliveredAt: deliveredAt.toISOString() } : {}),
      });
    }
  }
  return out;
}

// ---------------- Helpful votes ----------------
export async function voteHelpful(userId: string, reviewId: string): Promise<{ helpfulCount: number; voted: true }> {
  const r = await Review.findOne({ _id: oid(reviewId), status: 'published' }).select('buyerId helpfulCount').lean();
  if (!r) throw new AppError(404, 'NOT_FOUND', 'Review not found');
  if (String(r.buyerId) === userId) throw new AppError(400, 'OWN_REVIEW', 'You cannot vote on your own review');
  try {
    await ReviewVote.create({ reviewId: r._id, userId: oid(userId) });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new AppError(409, 'ALREADY_VOTED', 'You already marked this review as helpful');
    throw err;
  }
  const u = await Review.findByIdAndUpdate(r._id, { $inc: { helpfulCount: 1 } }, { new: true }).select('helpfulCount').lean();
  return { helpfulCount: u?.helpfulCount ?? r.helpfulCount + 1, voted: true };
}

export async function unvoteHelpful(userId: string, reviewId: string): Promise<{ helpfulCount: number; voted: false }> {
  const del = await ReviewVote.deleteOne({ reviewId: oid(reviewId), userId: oid(userId) });
  const u =
    del.deletedCount === 1
      ? await Review.findOneAndUpdate({ _id: oid(reviewId), helpfulCount: { $gt: 0 } }, { $inc: { helpfulCount: -1 } }, { new: true }).select('helpfulCount').lean()
      : await Review.findById(oid(reviewId)).select('helpfulCount').lean();
  return { helpfulCount: u?.helpfulCount ?? 0, voted: false };
}

/** Called after a review report is stored: enough reports send the review to moderation. */
export async function onReviewReported(reviewId: Types.ObjectId): Promise<void> {
  const r = await Review.findByIdAndUpdate(reviewId, { $inc: { reportCount: 1 } }, { new: true }).lean<ReviewLean>();
  if (r && r.status === 'published' && r.reportCount >= REPORT_HIDE_THRESHOLD) {
    await Review.updateOne({ _id: r._id, status: 'published' }, { $set: { status: 'pending' }, $addToSet: { flags: 'reports' } });
    await recomputeRatings(r.productId, r.storeId);
  }
}

// ---------------- Seller ----------------
export async function sellerReviews(storeId: Types.ObjectId, q: { rating?: number; replied?: '0' | '1'; cursor?: string; limit: number }) {
  const filter = {
    storeId,
    status: { $in: ['published', 'pending'] },
    ...(q.rating ? { rating: q.rating } : {}),
    ...(q.replied === '1' ? { reply: { $exists: true } } : q.replied === '0' ? { reply: { $exists: false } } : {}),
    ...cursorFilter('_id', -1, q.cursor),
  };
  const rows = await Review.find(filter).sort(cursorSort('_id', -1)).limit(q.limit + 1).lean<ReviewLean[]>();
  const page = paginate(rows, q.limit, '_id');
  const [names, products] = await Promise.all([
    authors(page.items.map((r) => r.buyerId)),
    Product.find({ _id: { $in: page.items.map((r) => r.productId) }, storeId }).select('title slug images').lean(),
  ]);
  const byId = new Map(products.map((p) => [String(p._id), p]));
  return {
    items: page.items.map((r) => {
      const p = byId.get(String(r.productId));
      return toReviewDTO(r, names.get(String(r.buyerId)), p ? { product: { title: p.title, slug: p.slug, ...(p.images?.[0]?.url ? { image: p.images[0].url } : {}) } } : {});
    }),
    nextCursor: page.nextCursor,
  };
}

export async function replyToReview(req: Request, reviewId: string, text: string): Promise<ReviewDTO> {
  const storeId = req.store!._id as Types.ObjectId;
  const clean = cleanText(text);
  if (!clean.text) throw new AppError(400, 'VALIDATION_ERROR', 'Reply cannot be empty');
  const r = await Review.findOneAndUpdate(
    { _id: oid(reviewId), storeId, status: { $in: ['published', 'pending'] } },
    { $set: { reply: { text: clean.text.slice(0, 1000), by: oid(req.user!.id), at: new Date() } } },
    { new: true },
  ).lean<ReviewLean>();
  if (!r) throw new AppError(404, 'NOT_FOUND', 'Review not found');
  await audit({ action: 'review.replied', req, targetType: 'Review', targetId: r._id, meta: { flagged: clean.flagged } });
  const p = await Product.findById(r.productId).select('slug title').lean();
  void notifySafe({ userId: String(r.buyerId), type: 'review.reply', title: 'The seller replied to your review', body: p?.title ?? 'Your review', ...(p ? { link: `/p/${p.slug}` } : {}) });
  const names = await authors([r.buyerId]);
  return toReviewDTO(r, names.get(String(r.buyerId)));
}
