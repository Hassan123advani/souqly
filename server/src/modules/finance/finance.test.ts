import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { makeOrder, setPayoutMethod } from '../../test/growthFixtures';
import { addStaff, api, makeSeller } from '../orders/orderTestFixtures';
import { transitionOrder } from '../orders/order.service';
import { Payout } from '../payouts/payout.model';
import { ReturnRequest } from '../returns/return.model';
import { setSetting, clearSettingsCache } from '../settings/settings.service';
import { computeBalance, ledgerOnDelivered, reconcileLedger } from './finance.service';
import { SellerLedger } from './ledger.model';
import { Order, type OrderLean } from '../orders/order.model';

const DAY = 86_400_000;

describe('computeBalance (pure)', () => {
  it('holds sales until availableAt and subtracts payouts / refunds', () => {
    const now = new Date();
    const b = computeBalance(
      [
        { type: 'sale', amount: 10_000, availableAt: new Date(now.getTime() - DAY) },
        { type: 'sale', amount: 5_000, availableAt: new Date(now.getTime() + DAY) },
        { type: 'refund', amount: -2_000, availableAt: now },
        { type: 'payout', amount: -3_000, availableAt: now },
        { type: 'payout_reversal', amount: 3_000, availableAt: now },
      ],
      now,
    );
    expect(b).toEqual({ available: 8_000, onHold: 5_000, lifetime: 15_000, refunds: 2_000 });
  });
});

describe('seller finance API', () => {
  it('summary: hold days, refunds and payouts; ledger is idempotent', async () => {
    const s = await makeSeller('Finance One');
    const storeId = s.store._id;
    // Online orders: the seller is credited 85% on delivery (flat 15% commission, docs/api-billing.md).
    const old = await makeOrder({ storeId, total: 300_000, deliveredDaysAgo: 10, method: 'stripe' });
    await makeOrder({ storeId, total: 100_000, deliveredDaysAgo: 2, method: 'stripe' }); // still on hold
    await makeOrder({ storeId, total: 100_000, method: 'stripe' }); // not delivered: not in ledger
    await makeOrder({ storeId, total: 400_000, deliveredDaysAgo: 10 }); // COD: the seller already holds the cash → no credit

    let res = await s.agent.get(api('/seller/finance/summary'));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ available: 255_000, onHold: 85_000, lifetime: 340_000, holdDays: 7, minPayout: 100_000 });

    // Re-running reconcile + the delivered hook never duplicates entries.
    await reconcileLedger(storeId);
    await ledgerOnDelivered(old.toObject() as OrderLean);
    expect(await SellerLedger.countDocuments({ storeId, type: 'sale' })).toBe(2);

    // A refunded return of an online order debits the seller pro rata (half the order → half the seller net).
    await ReturnRequest.create({ orderId: old._id, buyerId: old.buyerId, storeId, items: [], reason: 'damaged', status: 'refunded', refund: { method: 'wallet', amount: 150_000, at: new Date() }, timeline: [] }).catch(async () => {
      await ReturnRequest.collection.insertOne({ orderId: old._id, storeId, status: 'refunded', refund: { method: 'wallet', amount: 150_000, at: new Date() } });
    });
    res = await s.agent.get(api('/seller/finance/summary'));
    expect(res.body.data).toMatchObject({ available: 255_000 - 127_500, refunds: 127_500 });

    // Configurable hold: 0 days releases everything.
    await setSetting('financeHoldDays', 0);
    clearSettingsCache();
    const other = await makeSeller('Finance Hold');
    await makeOrder({ storeId: other.store._id, total: 100_000, deliveredDaysAgo: 1, method: 'stripe' });
    res = await other.agent.get(api('/seller/finance/summary'));
    expect(res.body.data).toMatchObject({ available: 85_000, onHold: 0, holdDays: 0 });
    await setSetting('financeHoldDays', 7);
    clearSettingsCache();
  });

  it('writes the ledger on the delivered transition (hook)', async () => {
    const s = await makeSeller('Finance Hook');
    const o = await makeOrder({ storeId: s.store._id, status: 'out_for_delivery' as never, total: 50_000, method: 'stripe' });
    await transitionOrder(o._id, 'delivered', { userId: null, kind: 'system' });
    const e = await SellerLedger.findOne({ storeId: s.store._id, ref: `sale:${o._id}` }).lean();
    expect(e).toMatchObject({ type: 'sale', amount: 42_500, orderNumber: o.number, commission: { bps: 1500, amount: 7_500 } });
    expect(e!.availableAt.getTime()).toBeGreaterThan(Date.now() + 6 * DAY);
  });

  it('payout requests: minimum, available limit, payout method, masked snapshot, ledger debit, rejection reversal', async () => {
    const s = await makeSeller('Finance Payout');
    const storeId = s.store._id;
    await makeOrder({ storeId, total: 500_000, deliveredDaysAgo: 30, method: 'stripe' }); // 425,000 available

    let res = await s.agent.post(api('/seller/finance/payout-requests')).send({ amount: 50_000 });
    expect(res.status).toBe(400); // below Rs. 1,000 (schema)
    res = await s.agent.post(api('/seller/finance/payout-requests')).send({ amount: 200_000 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_PAYOUT_METHOD');

    await setPayoutMethod(storeId);
    res = await s.agent.post(api('/seller/finance/payout-requests')).send({ amount: 500_000 });
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
    res = await s.agent.post(api('/seller/finance/payout-requests')).send({ amount: 300_000 });
    expect(res.status).toBe(201);
    expect(res.body.data.method).toEqual({ type: 'bank', bankName: 'HBL', accountTitle: 'Test Owner', accountMasked: '****4321' });
    expect(JSON.stringify(res.body)).not.toMatch(/accountNumberEnc|"enc"/);

    res = await s.agent.get(api('/seller/finance/summary'));
    expect(res.body.data).toMatchObject({ available: 125_000, pendingPayouts: 300_000 });
    res = await s.agent.post(api('/seller/finance/payout-requests')).send({ amount: 200_000 });
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');

    // Admin rejects → reversal credit appears on the next read.
    await Payout.updateOne({ storeId }, { $set: { status: 'rejected', rejectedAt: new Date() } });
    res = await s.agent.get(api('/seller/finance/summary'));
    expect(res.body.data.available).toBe(425_000);
    res = await s.agent.get(api('/seller/finance/transactions?limit=2'));
    expect(res.body.data.map((e: { type: string }) => e.type).sort()).toEqual(['payout', 'payout_reversal']);
    expect(res.body.meta.nextCursor).toBeTruthy();
    res = await s.agent.get(api(`/seller/finance/transactions?limit=2&cursor=${encodeURIComponent(res.body.meta.nextCursor)}`));
    expect(res.body.data.map((e: { type: string }) => e.type)).toEqual(['sale']);
  });

  it('statement (json/csv/pdf) and commission breakdown', async () => {
    const s = await makeSeller('Finance Statement');
    const o = await makeOrder({ storeId: s.store._id, total: 200_000, deliveredDaysAgo: 0, method: 'stripe' });
    const month = new Date().toISOString().slice(0, 7);
    let res = await s.agent.get(api(`/seller/finance/statements?month=${month}`));
    expect(res.body.data).toMatchObject({ opening: 0, closing: 170_000, totals: { sales: 170_000, commission: 30_000 } });
    res = await s.agent.get(api(`/seller/finance/statements?month=${month}&format=csv`));
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain(o.number);
    res = await s.agent.get(api(`/seller/finance/statements?month=${month}&format=pdf`)).buffer(true);
    expect(res.headers['content-type']).toBe('application/pdf');
    res = await s.agent.get(api(`/seller/finance/orders/${o._id}/commission`));
    expect(res.body.data).toMatchObject({ commissionBps: 1500, commission: 30_000, sellerNet: 170_000 });
    expect((await s.agent.get(api('/seller/finance/statements?month=2026-13'))).status).toBe(400);
  });

  it('permissions + tenant isolation', async () => {
    const a = await makeSeller('Finance Tenant A');
    const b = await makeSeller('Finance Tenant B');
    const oa = await makeOrder({ storeId: a.store._id, total: 900_000, deliveredDaysAgo: 30, method: 'stripe' });
    await setPayoutMethod(b.store._id);
    // B sees nothing of A, cannot read A's order commission and cannot withdraw A's money.
    expect((await b.agent.get(api('/seller/finance/summary'))).body.data.available).toBe(0);
    expect((await b.agent.get(api(`/seller/finance/orders/${oa._id}/commission`))).status).toBe(404);
    expect((await b.agent.get(api('/seller/finance/transactions'))).body.data).toEqual([]);
    const r = await b.agent.post(api('/seller/finance/payout-requests')).set('x-store-id', String(a.store._id)).send({ amount: 100_000 });
    expect(r.status).toBe(403);
    // Manager can view but not request payouts; cashier cannot view.
    const manager = await addStaff(a.store._id, 'MANAGER');
    expect((await manager.agent.get(api('/seller/finance/summary'))).status).toBe(200);
    expect((await manager.agent.post(api('/seller/finance/payout-requests')).send({ amount: 100_000 })).status).toBe(403);
    const cashier = await addStaff(a.store._id, 'CASHIER');
    expect((await cashier.agent.get(api('/seller/finance/summary'))).status).toBe(403);
    expect(await Order.countDocuments({ storeId: new Types.ObjectId(String(a.store._id)) })).toBe(1);
  });
});
