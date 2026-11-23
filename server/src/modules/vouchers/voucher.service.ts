import mongoose, { Types } from 'mongoose';
import { AppError } from '../../lib/AppError';
import type { PricingVoucher } from '../orders/pricing';
import { Voucher, VoucherUsage, type IVoucher } from './voucher.model';

type VoucherLean = IVoucher & { _id: Types.ObjectId };

export function toPricingVoucher(v: VoucherLean): PricingVoucher {
  return {
    code: v.code,
    scope: v.scope,
    ...(v.storeId ? { storeId: String(v.storeId) } : {}),
    type: v.type,
    value: v.value,
    minSpend: v.minSpend ?? 0,
    ...(v.maxDiscount ? { maxDiscount: v.maxDiscount } : {}),
    ...(v.categoryIds?.length ? { categoryIds: v.categoryIds.map(String) } : {}),
    ...(v.productIds?.length ? { productIds: v.productIds.map(String) } : {}),
  };
}

/**
 * Finds a usable voucher by code: platform voucher first, else a store voucher of one of the stores
 * in the cart. Throws 400/404 with a stable code when it cannot be used by this user right now.
 */
export async function findUsableVoucher(code: string, userId: string, cartStoreIds: string[]): Promise<VoucherLean> {
  const candidates = await Voucher.find({
    code,
    isActive: true,
    $or: [{ scope: 'platform' }, { scope: 'store', storeId: { $in: cartStoreIds.map((s) => new Types.ObjectId(s)) } }],
  }).lean<VoucherLean[]>();
  const v = candidates.find((c) => c.scope === 'platform') ?? candidates[0];
  if (!v) throw new AppError(404, 'VOUCHER_NOT_FOUND', 'This voucher code is not valid for your cart');
  await assertVoucherUsable(v, userId);
  return v;
}

export async function assertVoucherUsable(v: VoucherLean, userId: string): Promise<void> {
  const now = Date.now();
  if (!v.isActive || v.startsAt.getTime() > now || v.endsAt.getTime() <= now) {
    throw new AppError(400, 'VOUCHER_EXPIRED', 'This voucher is not active');
  }
  if (v.usageLimit > 0 && v.usedCount >= v.usageLimit) throw new AppError(400, 'VOUCHER_EXHAUSTED', 'This voucher has been fully used');
  if (v.perUserLimit > 0) {
    const used = await VoucherUsage.countDocuments({ voucherId: v._id, userId: new Types.ObjectId(userId) });
    if (used >= v.perUserLimit) throw new AppError(400, 'VOUCHER_USED', 'You have already used this voucher');
  }
  if (v.followerOnly) {
    // Follows ship in a later phase; until a Follow model exists, follower-only vouchers cannot be used.
    const Follow = mongoose.models.Follow;
    const follows = Follow && v.storeId ? await Follow.exists({ userId: new Types.ObjectId(userId), storeId: v.storeId }) : null;
    if (!follows) throw new AppError(400, 'VOUCHER_NOT_ELIGIBLE', 'Follow the store to use this voucher');
  }
}

/** Loads the cart's saved voucher codes; silently drops ones that are no longer usable. */
export async function loadCartVouchers(
  userId: string,
  codes: { platform?: string | null; store: { storeId: Types.ObjectId; code: string }[] },
  storeIds: string[],
): Promise<{ platform?: VoucherLean; store: Record<string, VoucherLean>; dropped: string[] }> {
  const out: { platform?: VoucherLean; store: Record<string, VoucherLean>; dropped: string[] } = { store: {}, dropped: [] };
  if (codes.platform) {
    const v = await Voucher.findOne({ scope: 'platform', storeId: null, code: codes.platform }).lean<VoucherLean>();
    try {
      if (!v) throw new Error('gone');
      await assertVoucherUsable(v, userId);
      out.platform = v;
    } catch {
      out.dropped.push(codes.platform);
    }
  }
  for (const s of codes.store) {
    if (!storeIds.includes(String(s.storeId))) continue;
    const v = await Voucher.findOne({ scope: 'store', storeId: s.storeId, code: s.code }).lean<VoucherLean>();
    try {
      if (!v) throw new Error('gone');
      await assertVoucherUsable(v, userId);
      out.store[String(s.storeId)] = v;
    } catch {
      out.dropped.push(s.code);
    }
  }
  return out;
}

/** Atomically takes one global use of a voucher; false when the usage limit was hit concurrently. */
export async function takeVoucherUse(voucherId: Types.ObjectId): Promise<boolean> {
  const res = await Voucher.updateOne(
    { _id: voucherId, $or: [{ usageLimit: 0 }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }] },
    { $inc: { usedCount: 1 } },
  );
  return res.modifiedCount === 1;
}

export async function releaseVoucherUse(voucherId: Types.ObjectId): Promise<void> {
  await Voucher.updateOne({ _id: voucherId, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
}
