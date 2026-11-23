import { describe, expect, it } from 'vitest';
import { computePricing, lineEligible, priceLine, prorate, unitPriceFor, voucherAmount, type PricingLine, type PricingVoucher } from './pricing';

const line = (o: Partial<PricingLine> & { id: string; storeId: string; basePrice: number; qty: number }): PricingLine => ({
  productId: `p-${o.id}`,
  categoryPath: ['cat'],
  ...o,
});

const SOUQLY10: PricingVoucher = { code: 'SOUQLY10', scope: 'platform', type: 'percent', value: 1000, minSpend: 150_000, maxDiscount: 50_000 };

describe('unit price', () => {
  it('uses the base price by default', () => {
    expect(unitPriceFor({ basePrice: 1000, qty: 1 })).toEqual({ unitPrice: 1000, priceSource: 'base' });
  });
  it('applies a cheaper flash price, ignores a higher one', () => {
    expect(unitPriceFor({ basePrice: 1000, flashPrice: 800, qty: 1 })).toEqual({ unitPrice: 800, priceSource: 'flash' });
    expect(unitPriceFor({ basePrice: 1000, flashPrice: 1200, qty: 1 }).unitPrice).toBe(1000);
  });
  it('applies the best wholesale tier reached by qty', () => {
    const tiers = [
      { minQty: 5, price: 900 },
      { minQty: 10, price: 800 },
    ];
    expect(unitPriceFor({ basePrice: 1000, wholesaleTiers: tiers, qty: 4 }).unitPrice).toBe(1000);
    expect(unitPriceFor({ basePrice: 1000, wholesaleTiers: tiers, qty: 5 })).toEqual({ unitPrice: 900, priceSource: 'wholesale' });
    expect(unitPriceFor({ basePrice: 1000, wholesaleTiers: tiers, qty: 12 }).unitPrice).toBe(800);
  });
  it('picks the cheaper of flash and wholesale', () => {
    expect(unitPriceFor({ basePrice: 1000, flashPrice: 850, wholesaleTiers: [{ minQty: 3, price: 900 }], qty: 3 })).toEqual({ unitPrice: 850, priceSource: 'flash' });
    expect(unitPriceFor({ basePrice: 1000, flashPrice: 950, wholesaleTiers: [{ minQty: 3, price: 900 }], qty: 3 }).priceSource).toBe('wholesale');
  });
  it('computes line total and savings vs compare-at', () => {
    const l = priceLine(line({ id: 'a', storeId: 's', basePrice: 1000, compareAtPrice: 1500, flashPrice: 700, qty: 2 }));
    expect(l.lineTotal).toBe(1400);
    expect(l.savings).toBe(1600);
  });
});

describe('vouchers', () => {
  it('percent with cap, fixed never above amount, free shipping is 0 here', () => {
    expect(voucherAmount({ type: 'percent', value: 1000 }, 200_000)).toBe(20_000);
    expect(voucherAmount({ type: 'percent', value: 1000, maxDiscount: 50_000 }, 1_000_000)).toBe(50_000);
    expect(voucherAmount({ type: 'fixed', value: 30_000 }, 20_000)).toBe(20_000);
    expect(voucherAmount({ type: 'free_shipping', value: 0 }, 20_000)).toBe(0);
    expect(voucherAmount({ type: 'percent', value: 333 }, 1001)).toBe(33); // rounds half away
  });
  it('category / product restrictions', () => {
    expect(lineEligible({}, { productId: 'p', categoryPath: ['a'] })).toBe(true);
    expect(lineEligible({ categoryIds: ['a'] }, { productId: 'p', categoryPath: ['root', 'a'] })).toBe(true);
    expect(lineEligible({ categoryIds: ['b'] }, { productId: 'p', categoryPath: ['a'] })).toBe(false);
    expect(lineEligible({ productIds: ['p'], categoryIds: ['b'] }, { productId: 'p', categoryPath: ['a'] })).toBe(true);
  });
});

describe('prorate', () => {
  it('splits by share and gives the remainder to the largest share', () => {
    expect(prorate(100, [1000, 1000, 1000])).toEqual([34, 33, 33]);
    expect(prorate(100, [100, 300, 100])).toEqual([20, 60, 20]);
    expect(prorate(10, [3, 7, 3])).toEqual([2, 6, 2]);
    const parts = prorate(1001, [333, 333, 334]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000); // capped by total share
  });
  it('handles zero / empty', () => {
    expect(prorate(0, [1, 2])).toEqual([0, 0]);
    expect(prorate(50, [0, 0])).toEqual([0, 0]);
  });
  it('never exceeds a share', () => {
    const parts = prorate(10, [1, 100]);
    expect(parts[0]).toBeLessThanOrEqual(1);
    expect(parts[0]! + parts[1]!).toBe(10);
  });
});

describe('computePricing', () => {
  const ship = { A: { rate: 15_000, freeAbove: 300_000 }, B: { rate: 25_000, freeAbove: 300_000 } };

  it('groups by store with shipping per store', () => {
    const r = computePricing({
      lines: [line({ id: '1', storeId: 'A', basePrice: 100_000, qty: 1 }), line({ id: '2', storeId: 'B', basePrice: 50_000, qty: 2 })],
      shipping: ship,
    });
    expect(r.stores.map((s) => [s.storeId, s.itemsSubtotal, s.shippingFee, s.total])).toEqual([
      ['A', 100_000, 15_000, 115_000],
      ['B', 100_000, 25_000, 125_000],
    ]);
    expect(r).toMatchObject({ itemsSubtotal: 200_000, shippingTotal: 40_000, discountTotal: 0, total: 240_000 });
    expect(r.stores[0]!.freeShippingRemaining).toBe(200_000);
  });

  it('free shipping above threshold and for all-free-shipping lines', () => {
    const r = computePricing({
      lines: [line({ id: '1', storeId: 'A', basePrice: 300_000, qty: 1 }), line({ id: '2', storeId: 'B', basePrice: 1000, qty: 1, freeShipping: true })],
      shipping: ship,
    });
    expect(r.stores.map((s) => s.shippingFee)).toEqual([0, 0]);
    expect(r.discountTotal).toBe(0);
  });

  it('store voucher applies only to its store and respects min spend', () => {
    const sv: PricingVoucher = { code: 'NOOR5', scope: 'store', storeId: 'A', type: 'fixed', value: 5_000, minSpend: 50_000 };
    const r = computePricing({
      lines: [line({ id: '1', storeId: 'A', basePrice: 60_000, qty: 1 }), line({ id: '2', storeId: 'B', basePrice: 60_000, qty: 1 })],
      shipping: ship,
      storeVouchers: { A: sv },
    });
    expect(r.stores[0]).toMatchObject({ storeDiscount: 5_000, storeVoucher: { valid: true, discount: 5_000 } });
    expect(r.stores[1]!.storeDiscount).toBe(0);
    const low = computePricing({ lines: [line({ id: '1', storeId: 'A', basePrice: 40_000, qty: 1 })], shipping: ship, storeVouchers: { A: sv } });
    expect(low.stores[0]!.storeVoucher).toMatchObject({ valid: false, reason: 'MIN_SPEND' });
    expect(low.stores[0]!.storeDiscount).toBe(0);
  });

  it('platform voucher is prorated by subtotal share with remainder to the largest store', () => {
    const r = computePricing({
      lines: [
        line({ id: '1', storeId: 'A', basePrice: 100_001, qty: 1 }),
        line({ id: '2', storeId: 'B', basePrice: 200_003, qty: 1 }),
      ],
      shipping: ship,
      platformVoucher: { ...SOUQLY10, maxDiscount: undefined },
    });
    const total = 30_000; // 10% of 300_004 = 30_000.4 → 30_000
    expect(r.platformVoucher).toMatchObject({ valid: true, discount: total });
    const [a, b] = r.stores;
    expect(a!.platformDiscount + b!.platformDiscount).toBe(total);
    expect(a!.platformDiscount).toBe(Math.floor((total * 100_001) / 300_004));
    expect(b!.platformDiscount).toBeGreaterThan(a!.platformDiscount);
  });

  it('platform voucher respects max discount and min spend', () => {
    const big = computePricing({ lines: [line({ id: '1', storeId: 'A', basePrice: 1_000_000, qty: 1 })], shipping: ship, platformVoucher: SOUQLY10 });
    expect(big.stores[0]!.platformDiscount).toBe(50_000);
    const small = computePricing({ lines: [line({ id: '1', storeId: 'A', basePrice: 100_000, qty: 1 })], shipping: ship, platformVoucher: SOUQLY10 });
    expect(small.platformVoucher).toMatchObject({ valid: false, reason: 'MIN_SPEND', discount: 0 });
    expect(small.total).toBe(115_000);
  });

  it('platform voucher applies after the store voucher', () => {
    const r = computePricing({
      lines: [line({ id: '1', storeId: 'A', basePrice: 200_000, qty: 1 })],
      shipping: ship,
      storeVouchers: { A: { code: 'S', scope: 'store', storeId: 'A', type: 'fixed', value: 20_000, minSpend: 0 } },
      platformVoucher: { ...SOUQLY10, maxDiscount: undefined, minSpend: 0 },
    });
    expect(r.stores[0]).toMatchObject({ storeDiscount: 20_000, platformDiscount: 18_000, shippingFee: 15_000, total: 177_000 });
    expect(r.discountTotal).toBe(38_000);
  });

  it('free-shipping vouchers (store and platform with cap)', () => {
    const r = computePricing({
      lines: [line({ id: '1', storeId: 'A', basePrice: 10_000, qty: 1 }), line({ id: '2', storeId: 'B', basePrice: 10_000, qty: 1 })],
      shipping: ship,
      storeVouchers: { A: { code: 'SHIPA', scope: 'store', storeId: 'A', type: 'free_shipping', value: 0, minSpend: 0 } },
      platformVoucher: { code: 'FREESHIP', scope: 'platform', type: 'free_shipping', value: 0, minSpend: 0, maxDiscount: 20_000 },
    });
    expect(r.stores[0]).toMatchObject({ shippingFee: 0, shippingDiscount: 15_000 });
    expect(r.stores[1]).toMatchObject({ shippingFee: 5_000, shippingDiscount: 20_000 });
    expect(r.platformVoucher!.discount).toBe(20_000);
    expect(r.discountTotal).toBe(35_000);
    expect(r.total).toBe(25_000);
  });

  it('voucher restricted to a category only discounts eligible lines', () => {
    const r = computePricing({
      lines: [
        line({ id: '1', storeId: 'A', basePrice: 100_000, qty: 1, categoryPath: ['elec'] }),
        line({ id: '2', storeId: 'A', basePrice: 100_000, qty: 1, categoryPath: ['fashion'] }),
      ],
      shipping: ship,
      platformVoucher: { code: 'ELEC', scope: 'platform', type: 'percent', value: 1000, minSpend: 0, categoryIds: ['elec'] },
    });
    expect(r.stores[0]!.platformDiscount).toBe(10_000);
  });

  it('totals stay integers and non-negative', () => {
    const r = computePricing({
      lines: [line({ id: '1', storeId: 'A', basePrice: 333, qty: 3 })],
      shipping: { A: { rate: 0 } },
      platformVoucher: { code: 'X', scope: 'platform', type: 'fixed', value: 99_999, minSpend: 0 },
    });
    expect(r.total).toBe(0);
    for (const v of [r.total, r.itemsSubtotal, r.discountTotal]) expect(Number.isInteger(v)).toBe(true);
  });
});
