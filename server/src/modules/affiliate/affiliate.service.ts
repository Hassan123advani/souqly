import { AFFILIATE_BPS, DEFAULT_RETURN_DAYS, applyBps } from '@souqly/shared';
import { Types } from 'mongoose';
import { env } from '../../config/env';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { Product } from '../catalog/product.model';
import { DAY_MS, holdDays } from '../finance/hold';
import { isFlagOn } from '../loyalty/flags';
import { Order, type OrderLean } from '../orders/order.model';
import { ReturnRequest } from '../returns/return.model';
import { StoreMember } from '../stores/storeMember.model';
import { User } from '../users/user.model';
import { credit, debit } from '../wallet/wallet.service';
import { AffiliateCommission, type AffiliateCommissionLean } from './affiliate.model';

/**
 * Affiliate links (Phase 10, flag `affiliateLinks`). 2% (AFFILIATE_BPS, shared) of the item value (items -
 * promo - store voucher). The commission is recorded at checkout, scheduled on delivery and paid to the
 * affiliate's wallet only once the order's return window has passed (security review M3, D-091):
 * cancelled / returned / refunded orders void it, partial refunds reduce it pro rata.
 */
export { AFFILIATE_BPS };
export const AFFILIATE_COOKIE = 'sq_aff';
/** Upper bound for the hold so one odd product policy can't park a commission for months. */
const MAX_HOLD_DAYS = 60;
const VOID_ORDER_STATUSES = ['cancelled', 'returned', 'refunded'];
const FINAL_RETURN_STATUSES = ['refunded', 'rejected'];

const oid = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));

export async function affiliateLink(userId: string, productId: string): Promise<{ url: string; code: string }> {
  const [u, p] = await Promise.all([
    User.findById(oid(userId)).select('referralCode').lean(),
    Product.findOne({ _id: oid(productId), status: 'published', deletedAt: { $exists: false } }).select('slug').lean(),
  ]);
  if (!u) throw new AppError(404, 'NOT_FOUND', 'User not found');
  if (!p) throw new AppError(404, 'NOT_FOUND', 'Product not found');
  return { code: u.referralCode, url: `${env.CLIENT_URL.replace(/\/$/, '')}/p/${encodeURIComponent(p.slug)}?aff=${encodeURIComponent(u.referralCode)}` };
}

/**
 * Resolves an affiliate code to a user id. Self-referral (buyer = affiliate) is ignored. Returns
 * undefined when the flag is off or the code is unknown — attribution never blocks a checkout.
 */
export async function resolveAffiliate(code: string | undefined, buyerId: string): Promise<Types.ObjectId | undefined> {
  if (!code || !/^[A-Za-z0-9]{4,16}$/.test(code)) return undefined;
  if (!(await isFlagOn('affiliateLinks'))) return undefined;
  const u = await User.findOne({ referralCode: code.toUpperCase() }).select('_id').lean();
  const u2 = u ?? (await User.findOne({ referralCode: code }).select('_id').lean());
  if (!u2 || String(u2._id) === String(buyerId)) return undefined;
  return u2._id;
}

/**
 * Creates the pending commission for an attributed order (idempotent: unique orderId). Members of the
 * order's own store (owner or staff, any status) never earn affiliate commission on it.
 */
export async function recordAffiliateCommission(order: Pick<OrderLean, '_id' | 'storeId' | 'number' | 'subtotal' | 'discounts' | 'affiliateUserId'>): Promise<void> {
  if (!order.affiliateUserId) return;
  if (await StoreMember.exists({ storeId: order.storeId, userId: order.affiliateUserId })) return;
  const base = Math.max(0, order.subtotal - (order.discounts?.promo ?? 0) - (order.discounts?.store ?? 0));
  const amount = applyBps(base, AFFILIATE_BPS);
  if (amount <= 0) return;
  try {
    await AffiliateCommission.create({ affiliateUserId: order.affiliateUserId, orderId: order._id, storeId: order.storeId, orderNumber: order.number, base, bps: AFFILIATE_BPS, amount });
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
  }
}

/** Hold after delivery: the longest product return window in the order, at least the finance hold. */
async function holdDaysFor(order: Pick<OrderLean, 'items'>): Promise<number> {
  const ids = (order.items ?? []).map((i) => i.productId);
  const products = ids.length ? await Product.find({ _id: { $in: ids } }).select('returnPolicy').lean() : [];
  const returnDays = products.length ? Math.max(...products.map((p) => p.returnPolicy?.days ?? DEFAULT_RETURN_DAYS)) : DEFAULT_RETURN_DAYS;
  return Math.min(MAX_HOLD_DAYS, Math.max(await holdDays(), returnDays));
}

/**
 * Order delivered: schedules the pending commission for release after the return window (it stays
 * `pending`; `releaseAffiliateCommissions` pays it). Returns true when a commission was scheduled. Never throws.
 */
export async function creditAffiliateOnDelivery(order: Pick<OrderLean, '_id' | 'number'>): Promise<boolean> {
  try {
    const c = await AffiliateCommission.findOne({ orderId: order._id, status: 'pending', releaseAt: { $exists: false } }).select('_id').lean();
    if (!c) return false;
    const full = await Order.findById(order._id).select('items').lean<OrderLean>();
    const days = await holdDaysFor(full ?? { items: [] });
    const r = await AffiliateCommission.updateOne({ _id: c._id, status: 'pending', releaseAt: { $exists: false } }, { $set: { releaseAt: new Date(Date.now() + days * DAY_MS) } });
    return r.modifiedCount === 1;
  } catch (err) {
    logger.error({ err, order: order.number }, 'Affiliate commission scheduling failed');
    return false;
  }
}

/** Pays one due commission: wallet credit FIRST (idempotent ref), then the status flip (code review M5). */
async function releaseOne(c: AffiliateCommissionLean): Promise<'credited' | 'void' | 'waiting'> {
  const order = await Order.findById(c.orderId).select('status total').lean<OrderLean>();
  if (!order || VOID_ORDER_STATUSES.includes(order.status)) {
    await AffiliateCommission.updateOne({ _id: c._id, status: 'pending' }, { $set: { status: 'void' } });
    return 'void';
  }
  if (order.status !== 'delivered') return 'waiting'; // return requested: wait for the outcome
  const returns = await ReturnRequest.find({ orderId: c.orderId }).select('status refund').lean();
  if (returns.some((r) => !FINAL_RETURN_STATUSES.includes(r.status))) return 'waiting';
  const refunded = returns.filter((r) => r.status === 'refunded').reduce((s, r) => s + (r.refund?.amount ?? 0), 0);
  const amount = order.total > 0 ? Math.floor((c.amount * Math.max(0, order.total - refunded)) / order.total) : 0;
  if (amount <= 0) {
    await AffiliateCommission.updateOne({ _id: c._id, status: 'pending' }, { $set: { status: 'void' } });
    return 'void';
  }
  await credit({ userId: String(c.affiliateUserId), amount, reason: 'affiliate', ref: `affiliate:${String(c.orderId)}`, meta: { orderNumber: c.orderNumber } });
  await AffiliateCommission.updateOne({ _id: c._id, status: 'pending' }, { $set: { status: 'credited', creditedAt: new Date(), amount } });
  return 'credited';
}

/** Sweep: pays commissions whose hold has passed (idempotent; a failed credit is retried next run). */
export async function releaseAffiliateCommissions(now = new Date(), max = 500): Promise<{ credited: number; voided: number; waiting: number; failed: number }> {
  const out = { credited: 0, voided: 0, waiting: 0, failed: 0 };
  const due = await AffiliateCommission.find({ status: 'pending', releaseAt: { $lte: now } }).sort({ releaseAt: 1 }).limit(max).lean<AffiliateCommissionLean[]>();
  for (const c of due) {
    try {
      const r = await releaseOne(c);
      if (r === 'credited') out.credited++;
      else if (r === 'void') out.voided++;
      else out.waiting++;
    } catch (err) {
      out.failed++;
      logger.error({ err, order: c.orderNumber }, 'Affiliate commission release failed (retried next sweep)');
    }
  }
  return out;
}

/**
 * Cancelled / returned / refunded orders void a pending commission. A commission that was already paid
 * (before the hold existed) is clawed back from the wallet (`affiliate_reversal:<orderId>`, best effort).
 */
export async function voidAffiliateCommission(orderId: Types.ObjectId): Promise<void> {
  try {
    const r = await AffiliateCommission.updateOne({ orderId, status: 'pending' }, { $set: { status: 'void' } });
    if (r.modifiedCount) return;
    const paid = await AffiliateCommission.findOneAndUpdate({ orderId, status: 'credited' }, { $set: { status: 'void', reversedAt: new Date() } }, { new: true }).lean<AffiliateCommissionLean>();
    if (!paid) return;
    await debit({ userId: String(paid.affiliateUserId), amount: paid.amount, reason: 'affiliate_reversal', ref: `affiliate_reversal:${String(orderId)}`, meta: { orderNumber: paid.orderNumber } }).catch((err) =>
      logger.warn({ err, order: paid.orderNumber }, 'Affiliate clawback failed (wallet balance too low); left for admin follow-up'),
    );
  } catch (err) {
    logger.error({ err, orderId: String(orderId) }, 'Affiliate commission void failed');
  }
}

export async function myCommissions(userId: string) {
  const rows = await AffiliateCommission.find({ affiliateUserId: oid(userId) }).sort({ createdAt: -1 }).limit(100).lean();
  return rows.map((r) => ({ id: String(r._id), orderNumber: r.orderNumber, amount: r.amount, status: r.status, createdAt: r.createdAt.toISOString() }));
}
