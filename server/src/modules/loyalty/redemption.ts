import { LOYALTY } from '@souqly/shared';

/**
 * Pure coin-redemption rule: 100 coins = Rs. 10 (1 coin = 10 paisa), capped at 20% of `orderTotal`
 * and at the coins the buyer has. Only whole coins are spent.
 */
export function coinsRedemption(input: { requested: number; balance: number; orderTotal: number }): { coinsUsed: number; discount: number; maxCoins: number } {
  const requested = Math.max(0, Math.floor(input.requested || 0));
  const balance = Math.max(0, Math.floor(input.balance || 0));
  const capMinor = Math.floor((Math.max(0, input.orderTotal) * LOYALTY.MAX_REDEEM_BPS) / 10_000);
  const maxCoins = Math.min(balance, Math.floor(capMinor / LOYALTY.COIN_VALUE_MINOR));
  const coinsUsed = Math.min(requested, maxCoins);
  return { coinsUsed, discount: coinsUsed * LOYALTY.COIN_VALUE_MINOR, maxCoins };
}

/** Coins earned for a delivered order total (1 per Rs. 100). */
export function coinsForOrderTotal(totalMinor: number): number {
  return Math.max(0, Math.floor(totalMinor / LOYALTY.EARN_PER_MINOR));
}
