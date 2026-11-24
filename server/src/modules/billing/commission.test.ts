import { PLATFORM_COMMISSION_BPS, commissionSplit } from '@souqly/shared';
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { billingOrder } from '../../test/billingFixtures';
import { setSetting, clearSettingsCache } from '../settings/settings.service';
import { SellerLedger } from '../finance/ledger.model';
import { financeSummary } from '../finance/finance.service';
import { Order } from '../orders/order.model';
import { transitionOrder } from '../orders/order.service';
import { makeSeller } from '../orders/orderTestFixtures';
import { ReturnRequest } from '../returns/return.model';
import { CommissionEntry } from './commissionEntry.model';
import { recognizeCommission, returnReversalAmount, syncCommissions, syncOrderReversals } from './commission.service';

describe('commission math (pure)', () => {
  it('flat 15% for everyone: Rs 1,000 → 150/850, Rs 2,000 → 300/1,700, Rs 5,000 → 750/4,250', () => {
    expect(PLATFORM_COMMISSION_BPS).toBe(1500);
    expect(commissionSplit(100_000)).toMatchObject({ commission: 15_000, sellerNet: 85_000, bps: 1500 });
    expect(commissionSplit(200_000)).toMatchObject({ commission: 30_000, sellerNet: 170_000 });
    expect(commissionSplit(500_000)).toMatchObject({ commission: 75_000, sellerNet: 425_000 });
  });

  it('excludes shipping from the base (seller keeps shipping) and rounds half-up in paisa', () => {
    expect(commissionSplit(100_000, 20_000)).toMatchObject({ base: 100_000, commission: 15_000, sellerNet: 105_000 });
    expect(commissionSplit(333_333).commission).toBe(50_000); // 49,999.95 → 50,000
    expect(commissionSplit(1).commission).toBe(0);
    expect(commissionSplit(-50).commission).toBe(0); // never negative
  });

  it('partial return reversal is proportional (floor); returning every unit reverses the rest', () => {
    const order = { subtotal: 300_000, items: [{ variantId: 'a', qty: 2 }, { variantId: 'b', qty: 1 }] };
    // 45,000 commission; one unit of a (100,000 of 300,000) → floor(15,000)
    expect(returnReversalAmount(45_000, order, [{ variantId: 'a', qty: 1, price: 100_000 }])).toBe(15_000);
    expect(returnReversalAmount(45_001, order, [{ variantId: 'a', qty: 1, price: 100_000 }])).toBe(15_000); // 15,000.33 floored
    expect(returnReversalAmount(45_000, order, [{ variantId: 'a', qty: 2, price: 100_000 }, { variantId: 'b', qty: 1, price: 100_000 }])).toBe('rest');
  });
});

describe('commission recognition', () => {
  it('COD delivered: unpaid receivable, no balance credit (the seller holds the cash)', async () => {
    const s = await makeSeller('Comm COD');
    const o = await billingOrder({ storeId: s.store._id, subtotal: 200_000, shipping: 15_000, deliveredDaysAgo: 1 });
    const e = await CommissionEntry.findOne({ orderId: o._id }).lean();
    expect(e).toMatchObject({ kind: 'charge', channel: 'cod', base: 200_000, bps: 1500, amount: 30_000, status: 'unpaid', orderTotal: 215_000 });
    const fresh = await Order.findById(o._id).lean();
    expect(fresh).toMatchObject({ commission: { bps: 1500, amount: 30_000 }, sellerNet: 185_000 });
    expect(await SellerLedger.countDocuments({ storeId: s.store._id })).toBe(0);
  });

  it('online delivered: commission deducted, seller credited 85% (+ shipping) after the hold', async () => {
    const s = await makeSeller('Comm Online');
    await setSetting('financeHoldDays', 0);
    clearSettingsCache();
    try {
      const o = await billingOrder({ storeId: s.store._id, subtotal: 500_000, method: 'stripe', deliveredDaysAgo: 1 });
      expect(await CommissionEntry.findOne({ orderId: o._id }).lean()).toMatchObject({ channel: 'online', amount: 75_000, status: 'deducted' });
      const sale = await SellerLedger.findOne({ storeId: s.store._id, type: 'sale' }).lean();
      expect(sale).toMatchObject({ amount: 425_000, commission: { bps: 1500, amount: 75_000 } });
      expect((await financeSummary(s.store._id)).available).toBe(425_000);
    } finally {
      await setSetting('financeHoldDays', 7);
      clearSettingsCache();
    }
  });

  it('is idempotent: repeated delivered events, sweeps and parallel calls create exactly one charge', async () => {
    const s = await makeSeller('Comm Idem');
    const o = await billingOrder({ storeId: s.store._id, subtotal: 100_000, status: 'out_for_delivery' });
    await transitionOrder(o._id, 'delivered', { userId: null, kind: 'rider' });
    await Promise.all([recognizeCommission(o._id), recognizeCommission(o._id), recognizeCommission(o._id), syncCommissions(s.store._id)]);
    await syncCommissions();
    const rows = await CommissionEntry.find({ orderId: o._id }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 15_000, status: 'unpaid' });
  });

  it('cancelled orders never carry commission', async () => {
    const s = await makeSeller('Comm Cancel');
    const o = await billingOrder({ storeId: s.store._id, subtotal: 100_000 });
    await transitionOrder(o._id, 'cancelled', { userId: null, kind: 'buyer' }, { reason: 'Changed my mind' });
    await syncCommissions(s.store._id);
    expect(await recognizeCommission(o._id)).toBe(false);
    expect(await CommissionEntry.countDocuments({ orderId: o._id })).toBe(0);
  });
});

describe('commission reversal on refunds', () => {
  const refund = (o: { _id: Types.ObjectId; storeId: Types.ObjectId; buyerId: Types.ObjectId; number: string; items: { productId: Types.ObjectId; variantId: Types.ObjectId; price: number }[] }, qty: number[], amount: number) =>
    ReturnRequest.create({
      orderId: o._id,
      orderNumber: o.number,
      storeId: o.storeId,
      buyerId: o.buyerId,
      items: o.items.map((it, i) => ({ productId: it.productId, variantId: it.variantId, title: 't', price: it.price, qty: qty[i] })).filter((it) => it.qty! > 0),
      reason: 'damaged',
      status: 'refunded',
      refund: { method: 'wallet', amount, at: new Date() },
      timeline: [],
    });

  it('full refund reverses all commission; never more than once', async () => {
    const s = await makeSeller('Rev Full');
    const o = await billingOrder({ storeId: s.store._id, subtotal: 200_000, deliveredDaysAgo: 2 });
    await refund(o, [1], 200_000);
    await syncOrderReversals(o._id);
    await syncOrderReversals(o._id);
    await syncCommissions(s.store._id);
    const rev = await CommissionEntry.find({ orderId: o._id, kind: 'reversal' }).lean();
    expect(rev).toHaveLength(1);
    // Charge still unbilled → reversal is an unpaid offset on the same next invoice.
    expect(rev[0]).toMatchObject({ amount: -30_000, status: 'unpaid', reason: 'return_refund' });
  });

  it('partial refund reverses proportionally (integer floor, totals never negative)', async () => {
    const s = await makeSeller('Rev Partial');
    const o = await billingOrder({ storeId: s.store._id, subtotal: 300_001, items: [{ price: 100_000, qty: 2 }, { price: 100_001, qty: 1 }], deliveredDaysAgo: 2 });
    const charge = (await CommissionEntry.findOne({ orderId: o._id, kind: 'charge' }).lean())!;
    expect(charge.amount).toBe(45_000); // 45,000.15
    await refund(o, [1, 0], 100_000);
    await syncOrderReversals(o._id);
    const rev = await CommissionEntry.find({ orderId: o._id, kind: 'reversal' }).lean();
    expect(rev.map((r) => r.amount)).toEqual([-Math.floor((45_000 * 100_000) / 300_001)]);
    const net = charge.amount + rev.reduce((a, r) => a + r.amount, 0);
    expect(net).toBeGreaterThan(0);
  });

  it('reversal of commission already billed is credited back to the seller balance', async () => {
    const s = await makeSeller('Rev Billed');
    const o = await billingOrder({ storeId: s.store._id, subtotal: 100_000, deliveredDaysAgo: 2 });
    await CommissionEntry.updateOne({ orderId: o._id, kind: 'charge' }, { $set: { status: 'paid', invoiceId: new Types.ObjectId() } });
    await refund(o, [1], 100_000);
    await syncOrderReversals(o._id);
    expect(await CommissionEntry.findOne({ orderId: o._id, kind: 'reversal' }).lean()).toMatchObject({ amount: -15_000, status: 'credited' });
    expect(await SellerLedger.findOne({ storeId: s.store._id, type: 'commission_credit' }).lean()).toMatchObject({ amount: 15_000 });
  });
});
