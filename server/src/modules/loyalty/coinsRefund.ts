import { LOYALTY } from '@souqly/shared';
import type { Types } from 'mongoose';
import { logger } from '../../lib/logger';
import { changeCoins } from './coins.service';

type OrderCoins = { _id: Types.ObjectId; buyerId: Types.ObjectId; coinsUsed?: number; discounts?: { coins?: number }; subtotal: number };

/** Whole coins spent on one order (older orders without `coinsUsed` derive it from the coin discount). */
export function orderCoinsUsed(o: OrderCoins): number {
  if (o.coinsUsed && o.coinsUsed > 0) return o.coinsUsed;
  return Math.floor((o.discounts?.coins ?? 0) / LOYALTY.COIN_VALUE_MINOR);
}

/** Coins to give back for a partial return: proportional to the returned item value (floored). */
export function coinsForRefund(o: OrderCoins, refundedItemsValue?: number): number {
  const used = orderCoinsUsed(o);
  if (used <= 0) return 0;
  if (refundedItemsValue === undefined || o.subtotal <= 0 || refundedItemsValue >= o.subtotal) return used;
  return Math.floor((used * Math.max(0, refundedItemsValue)) / o.subtotal);
}

/**
 * Returns coins spent on an order to the buyer (cancel or return refund). Idempotent through the
 * ledger ref `coins-refund:<orderId>`: only the first refund for an order applies. Never throws.
 */
export async function refundOrderCoins(o: OrderCoins, refundedItemsValue?: number): Promise<number> {
  const coins = coinsForRefund(o, refundedItemsValue);
  if (coins <= 0) return 0;
  try {
    const r = await changeCoins({ userId: o.buyerId, amount: coins, reason: 'redeem_refund', ref: `coins-refund:${String(o._id)}` });
    return r.applied ? coins : 0;
  } catch (err) {
    logger.error({ err, orderId: String(o._id) }, 'Coin refund failed');
    return 0;
  }
}
