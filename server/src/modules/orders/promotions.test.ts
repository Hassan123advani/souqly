import { describe, expect, it } from 'vitest';
import { applyPromotions, computePricing, resolveFlashPrice, unitPriceFor, type PricingBundle, type PricingBxgy, type PricingLine, type PricingVoucher } from './pricing';

const line = (o: Partial<PricingLine> & { id: string; basePrice: number; qty: number }): PricingLine => ({
  storeId: 's1',
  productId: `p-${o.id}`,
  categoryPath: ['cat'],
  ...o,
});
const ship = { s1: { rate: 0 }, s2: { rate: 0 } };

const bundle: PricingBundle = { id: 'b1', storeId: 's1', name: 'Kurta + Shawl', bundlePrice: 4000, items: [{ productId: 'p-k', qty: 1 }, { productId: 'p-s', qty: 1 }] };
const b1g1: PricingBxgy = { id: 'x1', storeId: 's1', name: 'Buy 1 get 1 free', buy: { productIds: ['p-t'], qty: 1 }, get: { productIds: ['p-t'], qty: 1, discountBps: 10_000 } };

describe('bundles', () => {
  it('applies only to complete sets and as many times as complete', () => {
    const one = computePricing({ lines: [line({ id: 'k', basePrice: 3000, qty: 1 }), line({ id: 's', basePrice: 2000, qty: 1 })], shipping: ship, bundles: [bundle] });
    expect(one.stores[0]!.promoDiscount).toBe(1000);
    expect(one.stores[0]!.promotions).toEqual([{ id: 'b1', kind: 'bundle', name: 'Kurta + Shawl', times: 1, discount: 1000 }]);
    expect(one.total).toBe(4000);

    const partial = computePricing({ lines: [line({ id: 'k', basePrice: 3000, qty: 2 })], shipping: ship, bundles: [bundle] });
    expect(partial.stores[0]!.promoDiscount).toBe(0);

    const twice = computePricing({ lines: [line({ id: 'k', basePrice: 3000, qty: 3 }), line({ id: 's', basePrice: 2000, qty: 2 })], shipping: ship, bundles: [bundle] });
    expect(twice.stores[0]!.promoDiscount).toBe(2000);
    expect(twice.total).toBe(3 * 3000 + 2 * 2000 - 2000);
  });

  it('respects a variant-specific bundle item', () => {
    const vb: PricingBundle = { ...bundle, items: [{ productId: 'p-k', variantId: 'v-red', qty: 1 }, { productId: 'p-s', qty: 1 }] };
    const wrong = applyPromotions([{ productId: 'p-k', variantId: 'v-blue', unitPrice: 3000, qty: 1 }, { productId: 'p-s', unitPrice: 2000, qty: 1 }], [vb]);
    expect(wrong.discount).toBe(0);
    const right = applyPromotions([{ productId: 'p-k', variantId: 'v-red', unitPrice: 3000, qty: 1 }, { productId: 'p-s', unitPrice: 2000, qty: 1 }], [vb]);
    expect(right.discount).toBe(1000);
  });

  it('never applies a "bundle" that costs more than the items', () => {
    expect(applyPromotions([{ productId: 'p-k', unitPrice: 1000, qty: 1 }, { productId: 'p-s', unitPrice: 1000, qty: 1 }], [bundle]).discount).toBe(0);
  });

  it('only applies to its own store', () => {
    const r = computePricing({ lines: [line({ id: 'k', storeId: 's2', basePrice: 3000, qty: 1 }), line({ id: 's', storeId: 's2', basePrice: 2000, qty: 1 })], shipping: ship, bundles: [bundle] });
    expect(r.stores[0]!.promoDiscount).toBe(0);
  });
});

describe('buy X get Y', () => {
  it('buy 1 get 1 free discounts the cheaper unit, once per pair', () => {
    const r = computePricing({ lines: [line({ id: 't', basePrice: 1000, qty: 3 })], shipping: ship, promotions: [b1g1] });
    expect(r.stores[0]!.promoDiscount).toBe(1000); // 3 units → one pair
    const four = computePricing({ lines: [line({ id: 't', basePrice: 1000, qty: 4 })], shipping: ship, promotions: [b1g1] });
    expect(four.stores[0]!.promotions[0]).toMatchObject({ times: 2, discount: 2000 });
  });

  it('cross-product: buy 2 shirts, get 50% off a cap (cheapest cap discounted)', () => {
    const promo: PricingBxgy = { id: 'x2', storeId: 's1', name: 'Shirts + cap', buy: { productIds: ['p-sh'], qty: 2 }, get: { productIds: ['p-c1', 'p-c2'], qty: 1, discountBps: 5000 } };
    const lines = [line({ id: 'sh', basePrice: 2000, qty: 2 }), line({ id: 'c1', basePrice: 800, qty: 1 }), line({ id: 'c2', basePrice: 600, qty: 1 })];
    const r = computePricing({ lines, shipping: ship, promotions: [promo] });
    expect(r.stores[0]!.promoDiscount).toBe(300);
    // Not enough "buy" units → nothing.
    expect(computePricing({ lines: [line({ id: 'sh', basePrice: 2000, qty: 1 }), line({ id: 'c1', basePrice: 800, qty: 1 })], shipping: ship, promotions: [promo] }).stores[0]!.promoDiscount).toBe(0);
  });

  it('units used by a bundle are not reused by a BXGY promotion', () => {
    const promo: PricingBxgy = { id: 'x3', storeId: 's1', name: 'Shawl b1g1', buy: { productIds: ['p-s'], qty: 1 }, get: { productIds: ['p-s'], qty: 1, discountBps: 10_000 } };
    const r = computePricing({ lines: [line({ id: 'k', basePrice: 3000, qty: 1 }), line({ id: 's', basePrice: 2000, qty: 2 })], shipping: ship, bundles: [bundle], promotions: [promo] });
    // Bundle takes kurta + 1 shawl; only 1 shawl left → no b1g1.
    expect(r.stores[0]!.promotions.map((p) => p.kind)).toEqual(['bundle']);
    expect(r.stores[0]!.promoDiscount).toBe(1000);
  });
});

describe('promotions + vouchers', () => {
  it('store voucher applies to the post-promo amount; platform voucher after both', () => {
    const sv: PricingVoucher = { code: 'STORE10', scope: 'store', storeId: 's1', type: 'percent', value: 1000, minSpend: 0 };
    const pv: PricingVoucher = { code: 'PLAT5', scope: 'platform', type: 'percent', value: 500, minSpend: 0 };
    const r = computePricing({
      lines: [line({ id: 't', basePrice: 1000, qty: 2 })],
      shipping: ship,
      promotions: [b1g1],
      storeVouchers: { s1: sv },
      platformVoucher: pv,
    });
    const s = r.stores[0]!;
    expect(s.promoDiscount).toBe(1000);
    expect(s.storeDiscount).toBe(100); // 10% of 1000 (not of 2000)
    expect(s.platformDiscount).toBe(45); // 5% of 900
    expect(r.total).toBe(2000 - 1000 - 100 - 45);
    expect(r.discountTotal).toBe(1145);
  });

  it('min spend is checked against the post-promo amount', () => {
    const sv: PricingVoucher = { code: 'MIN', scope: 'store', storeId: 's1', type: 'fixed', value: 100, minSpend: 1500 };
    const r = computePricing({ lines: [line({ id: 't', basePrice: 1000, qty: 2 })], shipping: ship, promotions: [b1g1], storeVouchers: { s1: sv } });
    expect(r.stores[0]!.storeVoucher).toMatchObject({ valid: false, reason: 'MIN_SPEND' });
  });

  it('bundle price uses flash unit prices when cheaper (flash counted first)', () => {
    const r = computePricing({ lines: [line({ id: 'k', basePrice: 3000, flashPrice: 2500, qty: 1 }), line({ id: 's', basePrice: 2000, qty: 1 })], shipping: ship, bundles: [bundle] });
    expect(r.stores[0]!.itemsSubtotal).toBe(4500);
    expect(r.stores[0]!.promoDiscount).toBe(500);
  });
});

describe('flash deals', () => {
  it('platform flash price wins over a store deal; store deal used otherwise', () => {
    expect(resolveFlashPrice(900, 700)).toBe(900);
    expect(resolveFlashPrice(undefined, 700)).toBe(700);
    expect(resolveFlashPrice(undefined, undefined)).toBeUndefined();
    expect(unitPriceFor({ basePrice: 1000, flashPrice: resolveFlashPrice(undefined, 800), qty: 1 })).toEqual({ unitPrice: 800, priceSource: 'flash' });
  });
});

describe('existing pricing features (verified for Phase 10)', () => {
  it('wholesale tiers combine with BXGY on the tier price', () => {
    const r = computePricing({ lines: [line({ id: 't', basePrice: 1000, wholesaleTiers: [{ minQty: 2, price: 900 }], qty: 2 })], shipping: ship, promotions: [b1g1] });
    expect(r.stores[0]!.itemsSubtotal).toBe(1800);
    expect(r.stores[0]!.promoDiscount).toBe(900);
  });
});
