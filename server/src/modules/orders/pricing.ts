/**
 * Pure pricing engine (no I/O). All amounts are integer minor units; percentages are basis points.
 *
 * Order of operations per checkout:
 *   1. unit price per line = min(base, active flash price, best wholesale tier for qty)
 *   2. store subtotal = sum(line totals)
 *   3. store voucher discount (on that store's eligible lines)
 *   4. platform voucher discount (on all eligible lines, after store discounts), prorated across stores
 *      by their eligible share; rounding remainder goes to the largest share
 *   5. shipping per store (zone rate; free above threshold; free if every line ships free; free_shipping voucher)
 *   6. coins (Phase 8 hook, always 0 for now)
 */
import { applyBps } from '@souqly/shared';

export type VoucherType = 'percent' | 'fixed' | 'free_shipping';

export interface PricingVoucher {
  code: string;
  scope: 'platform' | 'store';
  storeId?: string;
  type: VoucherType;
  /** bps for percent, minor units for fixed (ignored for free_shipping). */
  value: number;
  minSpend: number;
  maxDiscount?: number;
  categoryIds?: string[];
  productIds?: string[];
}

export interface PricingLine {
  id: string;
  storeId: string;
  productId: string;
  categoryPath: string[];
  basePrice: number;
  compareAtPrice?: number;
  flashPrice?: number;
  wholesaleTiers?: { minQty: number; price: number }[];
  qty: number;
  freeShipping?: boolean;
}

export interface StoreShippingRule {
  /** Base fee for this buyer's zone. */
  rate: number;
  /** Store subtotal at or above which shipping is free. */
  freeAbove?: number;
}

export interface PricingInput {
  lines: PricingLine[];
  shipping: Record<string, StoreShippingRule>;
  storeVouchers?: Record<string, PricingVoucher | undefined>;
  platformVoucher?: PricingVoucher;
  coins?: number;
}

export interface PricedLine extends PricingLine {
  unitPrice: number;
  lineTotal: number;
  priceSource: 'base' | 'flash' | 'wholesale';
  /** Savings vs compare-at (or base) price for the line. */
  savings: number;
}

export interface VoucherResult {
  code: string;
  scope: 'platform' | 'store';
  type: VoucherType;
  discount: number;
  valid: boolean;
  reason?: 'MIN_SPEND' | 'NOT_ELIGIBLE';
}

export interface StorePricing {
  storeId: string;
  lines: PricedLine[];
  itemsSubtotal: number;
  storeDiscount: number;
  platformDiscount: number;
  shippingBase: number;
  shippingDiscount: number;
  shippingFee: number;
  total: number;
  storeVoucher?: VoucherResult;
  freeShippingRemaining?: number;
  freeShippingThreshold?: number;
}

export interface PricingResult {
  stores: StorePricing[];
  itemsSubtotal: number;
  shippingTotal: number;
  /** Store + platform voucher discounts + shipping discounts. */
  discountTotal: number;
  coins: number;
  total: number;
  /** Price savings (compare-at / flash / wholesale) + all discounts. */
  savings: number;
  platformVoucher?: VoucherResult;
}

/** Effective unit price for a line: cheapest of base, flash and the best applicable wholesale tier. */
export function unitPriceFor(line: Pick<PricingLine, 'basePrice' | 'flashPrice' | 'wholesaleTiers' | 'qty'>): {
  unitPrice: number;
  priceSource: PricedLine['priceSource'];
} {
  let unitPrice = line.basePrice;
  let priceSource: PricedLine['priceSource'] = 'base';
  if (line.flashPrice !== undefined && line.flashPrice >= 0 && line.flashPrice < unitPrice) {
    unitPrice = line.flashPrice;
    priceSource = 'flash';
  }
  const tier = (line.wholesaleTiers ?? [])
    .filter((t) => t.minQty > 1 && line.qty >= t.minQty && t.price >= 0)
    .sort((a, b) => b.minQty - a.minQty)[0];
  if (tier && tier.price < unitPrice) {
    unitPrice = tier.price;
    priceSource = 'wholesale';
  }
  return { unitPrice, priceSource };
}

export function priceLine(line: PricingLine): PricedLine {
  const { unitPrice, priceSource } = unitPriceFor(line);
  const lineTotal = unitPrice * line.qty;
  const reference = Math.max(line.basePrice, line.compareAtPrice ?? 0);
  return { ...line, unitPrice, priceSource, lineTotal, savings: Math.max(0, (reference - unitPrice) * line.qty) };
}

/** Whether a voucher's category/product restrictions allow a line. */
export function lineEligible(v: Pick<PricingVoucher, 'categoryIds' | 'productIds'>, line: Pick<PricingLine, 'productId' | 'categoryPath'>): boolean {
  const byProduct = v.productIds?.length ? v.productIds.includes(line.productId) : null;
  const byCategory = v.categoryIds?.length ? line.categoryPath.some((c) => v.categoryIds!.includes(c)) : null;
  if (byProduct === null && byCategory === null) return true;
  return !!byProduct || !!byCategory;
}

/** Discount amount of a percent/fixed voucher on an eligible amount (never above the amount). */
export function voucherAmount(v: Pick<PricingVoucher, 'type' | 'value' | 'maxDiscount'>, eligible: number): number {
  if (eligible <= 0 || v.type === 'free_shipping') return 0;
  let d = v.type === 'percent' ? applyBps(eligible, v.value) : v.value;
  if (v.maxDiscount !== undefined && v.maxDiscount > 0) d = Math.min(d, v.maxDiscount);
  return Math.max(0, Math.min(d, eligible));
}

/**
 * Splits `amount` across shares proportionally (floored), giving the rounding remainder to the
 * largest share (first one on ties). Each part is capped by its share. Sum(parts) === min(amount, sum(shares)).
 */
export function prorate(amount: number, shares: number[]): number[] {
  const total = shares.reduce((s, x) => s + Math.max(0, x), 0);
  if (amount <= 0 || total <= 0) return shares.map(() => 0);
  const target = Math.min(amount, total);
  const parts = shares.map((s) => Math.floor((target * Math.max(0, s)) / total));
  let remainder = target - parts.reduce((a, b) => a + b, 0);
  // Remainder to the largest share; if that is capped, continue with the next largest.
  const order = shares.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s || a.i - b.i);
  for (const { s, i } of order) {
    if (remainder <= 0) break;
    const room = Math.max(0, s) - parts[i]!;
    const add = Math.min(room, remainder);
    parts[i]! += add;
    remainder -= add;
  }
  return parts;
}

export function computePricing(input: PricingInput): PricingResult {
  const byStore = new Map<string, PricedLine[]>();
  for (const l of input.lines) {
    if (l.qty <= 0) continue;
    const list = byStore.get(l.storeId) ?? [];
    list.push(priceLine(l));
    byStore.set(l.storeId, list);
  }

  const stores: StorePricing[] = [];
  for (const [storeId, lines] of byStore) {
    const itemsSubtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
    const sv = input.storeVouchers?.[storeId];
    let storeDiscount = 0;
    let storeVoucher: VoucherResult | undefined;
    if (sv && (!sv.storeId || sv.storeId === storeId)) {
      const eligible = lines.filter((l) => lineEligible(sv, l)).reduce((s, l) => s + l.lineTotal, 0);
      if (eligible <= 0) storeVoucher = { code: sv.code, scope: 'store', type: sv.type, discount: 0, valid: false, reason: 'NOT_ELIGIBLE' };
      else if (eligible < sv.minSpend) storeVoucher = { code: sv.code, scope: 'store', type: sv.type, discount: 0, valid: false, reason: 'MIN_SPEND' };
      else {
        storeDiscount = voucherAmount(sv, eligible);
        storeVoucher = { code: sv.code, scope: 'store', type: sv.type, discount: storeDiscount, valid: true };
      }
    }
    stores.push({
      storeId,
      lines,
      itemsSubtotal,
      storeDiscount,
      platformDiscount: 0,
      shippingBase: 0,
      shippingDiscount: 0,
      shippingFee: 0,
      total: 0,
      ...(storeVoucher ? { storeVoucher } : {}),
    });
  }

  // Platform voucher: eligible share per store, after that store's own discount.
  const pv = input.platformVoucher;
  let platformVoucher: VoucherResult | undefined;
  let platformFreeShipping = false;
  if (pv) {
    const shares = stores.map((s) => {
      const eligible = s.lines.filter((l) => lineEligible(pv, l)).reduce((sum, l) => sum + l.lineTotal, 0);
      // The store discount reduces the eligible base proportionally to the eligible part.
      const storeCut = s.itemsSubtotal > 0 ? Math.round((s.storeDiscount * eligible) / s.itemsSubtotal) : 0;
      return Math.max(0, eligible - storeCut);
    });
    const eligibleTotal = shares.reduce((a, b) => a + b, 0);
    if (eligibleTotal <= 0) platformVoucher = { code: pv.code, scope: 'platform', type: pv.type, discount: 0, valid: false, reason: 'NOT_ELIGIBLE' };
    else if (eligibleTotal < pv.minSpend) platformVoucher = { code: pv.code, scope: 'platform', type: pv.type, discount: 0, valid: false, reason: 'MIN_SPEND' };
    else if (pv.type === 'free_shipping') {
      platformFreeShipping = true;
      platformVoucher = { code: pv.code, scope: 'platform', type: pv.type, discount: 0, valid: true };
    } else {
      const amount = voucherAmount(pv, eligibleTotal);
      const parts = prorate(amount, shares);
      stores.forEach((s, i) => (s.platformDiscount = parts[i]!));
      platformVoucher = { code: pv.code, scope: 'platform', type: pv.type, discount: amount, valid: true };
    }
  }

  // Shipping.
  let platformShipBudget = platformFreeShipping ? (pv?.maxDiscount && pv.maxDiscount > 0 ? pv.maxDiscount : Infinity) : 0;
  for (const s of stores) {
    const rule = input.shipping[s.storeId] ?? { rate: 0 };
    s.shippingBase = rule.rate;
    let waived = 0;
    const allFree = s.lines.every((l) => l.freeShipping);
    if (rule.freeAbove !== undefined && rule.freeAbove > 0) {
      s.freeShippingThreshold = rule.freeAbove;
      s.freeShippingRemaining = Math.max(0, rule.freeAbove - s.itemsSubtotal);
    }
    if (allFree || (rule.freeAbove !== undefined && rule.freeAbove > 0 && s.itemsSubtotal >= rule.freeAbove)) {
      waived = rule.rate;
    } else if (s.storeVoucher?.valid && s.storeVoucher.type === 'free_shipping') {
      const cap = input.storeVouchers?.[s.storeId]?.maxDiscount;
      waived = cap && cap > 0 ? Math.min(rule.rate, cap) : rule.rate;
      s.storeVoucher.discount = waived;
    }
    if (waived < rule.rate && platformShipBudget > 0) {
      const extra = Math.min(rule.rate - waived, platformShipBudget);
      waived += extra;
      platformShipBudget -= extra;
      if (platformVoucher) platformVoucher.discount += extra;
    }
    s.shippingDiscount = waived;
    s.shippingFee = rule.rate - waived;
    s.total = s.itemsSubtotal - s.storeDiscount - s.platformDiscount + s.shippingFee;
  }

  const itemsSubtotal = stores.reduce((a, s) => a + s.itemsSubtotal, 0);
  const shippingTotal = stores.reduce((a, s) => a + s.shippingFee, 0);
  const voucherDiscounts = stores.reduce((a, s) => a + s.storeDiscount + s.platformDiscount, 0);
  // Free-shipping vouchers count as discounts; threshold / free-product shipping does not.
  const voucherShipping = stores.reduce((a, s) => a + (s.storeVoucher?.type === 'free_shipping' && s.storeVoucher.valid ? s.storeVoucher.discount : 0), 0) +
    (platformFreeShipping ? (platformVoucher?.discount ?? 0) : 0);
  const coins = 0; // Phase 8 hook: input.coins is ignored until coin redemption ships.
  const total = stores.reduce((a, s) => a + s.total, 0) - coins;
  const priceSavings = stores.reduce((a, s) => a + s.lines.reduce((b, l) => b + l.savings, 0), 0);
  return {
    stores,
    itemsSubtotal,
    shippingTotal,
    discountTotal: voucherDiscounts + voucherShipping,
    coins,
    total,
    savings: priceSavings + voucherDiscounts + voucherShipping,
    ...(platformVoucher ? { platformVoucher } : {}),
  };
}
