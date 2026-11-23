import { applyBps } from '@souqly/shared';
import { Types } from 'mongoose';
import { env } from '../../config/env';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { Product } from '../catalog/product.model';
import { isFlagOn } from '../loyalty/flags';
import type { OrderLean } from '../orders/order.model';
import { User } from '../users/user.model';
import { credit } from '../wallet/wallet.service';
import { AffiliateCommission } from './affiliate.model';

/** 2% of the item value (items − promo − store voucher), credited to the affiliate's wallet on delivery. */
export const AFFILIATE_BPS = 200;
export const AFFILIATE_COOKIE = 'sq_aff';

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

/** Creates the pending commission for an attributed order (idempotent: unique orderId). */
export async function recordAffiliateCommission(order: Pick<OrderLean, '_id' | 'storeId' | 'number' | 'subtotal' | 'discounts' | 'affiliateUserId'>): Promise<void> {
  if (!order.affiliateUserId) return;
  const base = Math.max(0, order.subtotal - (order.discounts?.promo ?? 0) - (order.discounts?.store ?? 0));
  const amount = applyBps(base, AFFILIATE_BPS);
  if (amount <= 0) return;
  try {
    await AffiliateCommission.create({ affiliateUserId: order.affiliateUserId, orderId: order._id, storeId: order.storeId, orderNumber: order.number, base, bps: AFFILIATE_BPS, amount });
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
  }
}

/** Order delivered: credits the pending commission to the affiliate wallet exactly once. Never throws. */
export async function creditAffiliateOnDelivery(order: Pick<OrderLean, '_id' | 'number'>): Promise<boolean> {
  try {
    const c = await AffiliateCommission.findOneAndUpdate({ orderId: order._id, status: 'pending' }, { $set: { status: 'credited', creditedAt: new Date() } }, { new: true }).lean();
    if (!c) return false;
    // Wallet ref is idempotent too, so a retry after a crash between the two writes cannot double-pay.
    await credit({ userId: String(c.affiliateUserId), amount: c.amount, reason: 'affiliate', ref: `affiliate:${String(order._id)}`, meta: { orderNumber: order.number } });
    return true;
  } catch (err) {
    logger.error({ err, order: order.number }, 'Affiliate commission credit failed');
    return false;
  }
}

/** Cancelled / refunded orders void a still-pending commission. */
export async function voidAffiliateCommission(orderId: Types.ObjectId): Promise<void> {
  await AffiliateCommission.updateOne({ orderId, status: 'pending' }, { $set: { status: 'void' } }).catch(() => undefined);
}

export async function myCommissions(userId: string) {
  const rows = await AffiliateCommission.find({ affiliateUserId: oid(userId) }).sort({ createdAt: -1 }).limit(100).lean();
  return rows.map((r) => ({ id: String(r._id), orderNumber: r.orderNumber, amount: r.amount, status: r.status, createdAt: r.createdAt.toISOString() }));
}
