import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { setPlan } from '../../test/growthFixtures';
import { xhr } from '../../test/helpers';
import { Product } from '../catalog/product.model';
import { StockMovement } from '../inventory/stockMovement.model';
import { Order } from '../orders/order.model';
import { addStaff, api, makeItem, makeSeller } from '../orders/orderTestFixtures';
import { SellerLedger } from '../finance/ledger.model';
import { posTotals, receiptToken, shiftVariance, verifyReceiptToken } from './pos.service';

const sale = (variantId: string, o: Partial<{ qty: number; price: number; payments: { method: 'cash' | 'card' | 'wallet'; amount: number }[]; shiftId: string; discount: number }> = {}) => ({
  clientId: randomUUID(),
  createdAt: new Date(Date.now() - 60_000).toISOString(),
  items: [{ variantId, qty: o.qty ?? 1, price: o.price ?? 100_000, discount: 0 }],
  payments: o.payments ?? [{ method: 'cash' as const, amount: (o.qty ?? 1) * (o.price ?? 100_000) }],
  discount: o.discount ?? 0,
  ...(o.shiftId ? { shiftId: o.shiftId } : {}),
});

describe('POS pure helpers', () => {
  it('totals: discounts, change only from cash, underpaid invalid', () => {
    expect(posTotals({ items: [{ variantId: 'x', qty: 2, price: 1000, discount: 100 }], discount: 400, payments: [{ method: 'cash', amount: 2000 }] })).toMatchObject({
      subtotal: 2000,
      discount: 500,
      total: 1500,
      change: 500,
      valid: true,
    });
    expect(posTotals({ items: [{ variantId: 'x', qty: 1, price: 1000, discount: 0 }], discount: 0, payments: [{ method: 'card', amount: 1200 }] }).valid).toBe(false);
    expect(posTotals({ items: [{ variantId: 'x', qty: 1, price: 1000, discount: 0 }], discount: 0, payments: [{ method: 'cash', amount: 900 }] }).valid).toBe(false);
  });
  it('shift variance = counted − (opening + cash sales − cash refunds)', () => {
    expect(shiftVariance(10_000, 50_000, 5_000, 54_000)).toEqual({ expectedCash: 55_000, variance: -1_000 });
  });
  it('receipt tokens are signed', () => {
    const id = '0123456789abcdef01234567';
    expect(verifyReceiptToken(receiptToken(id))).toBe(id);
    expect(verifyReceiptToken(`${id}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`)).toBeNull();
    expect(verifyReceiptToken(`fedcba9876543210fedcba98.${receiptToken(id).split('.')[1]}`)).toBeNull();
  });
});

describe('POS API', () => {
  it('is gated by plan (Free → 403 PLAN_LIMIT) and permission', async () => {
    const s = await makeSeller('POS Free');
    const res = await s.agent.get(api('/seller/pos/catalog'));
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ code: 'PLAN_LIMIT', details: { plan: 'free', feature: 'pos' } });
    await setPlan(s.store._id, 'pro');
    const orders = await addStaff(s.store._id, 'ORDERS');
    expect((await orders.agent.get(api('/seller/pos/catalog'))).status).toBe(403);
    const cashier = await addStaff(s.store._id, 'CASHIER');
    expect((await cashier.agent.get(api('/seller/pos/catalog'))).status).toBe(200);
  });

  it('catalog, lookup, idempotent sync, stock conflict, receipts and shift variance', async () => {
    const s = await makeSeller('POS Pro');
    await setPlan(s.store._id, 'pro');
    const item = await makeItem(s.store._id, 100_000, 3);
    await Product.updateOne({ _id: item.productId }, { $set: { 'variants.0.barcode': '8964000111222' } });
    const sku = (await Product.findById(item.productId).lean())!.variants[0]!.sku;

    let res = await s.agent.get(api('/seller/pos/catalog'));
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ variantId: item.variantId, price: 100_000, stock: 3, barcode: '8964000111222', sku });
    const since = res.body.meta.serverTime;
    expect((await s.agent.get(api(`/seller/pos/catalog?updatedSince=${encodeURIComponent(since)}`))).body.data).toHaveLength(0);
    expect((await s.agent.get(api('/seller/pos/lookup?code=8964000111222'))).body.data.variantId).toBe(item.variantId);
    expect((await s.agent.get(api(`/seller/pos/lookup?code=${sku.toLowerCase()}`))).body.data.variantId).toBe(item.variantId);
    expect((await s.agent.get(api('/seller/pos/lookup?code=nope'))).status).toBe(404);

    // Shift.
    res = await s.agent.post(api('/seller/pos/shifts/open')).send({ openingCash: 50_000 });
    expect(res.status).toBe(201);
    const shiftId = res.body.data.id;
    expect((await s.agent.post(api('/seller/pos/shifts/open')).send({ openingCash: 1 })).body.error.code).toBe('SHIFT_OPEN');

    const first = sale(item.variantId, { qty: 2, shiftId, payments: [{ method: 'cash', amount: 250_000 }] });
    const conflict = sale(item.variantId, { qty: 4, shiftId, payments: [{ method: 'card', amount: 400_000 }] });
    const bad = sale('0123456789abcdef01234567', { shiftId });
    res = await s.agent.post(api('/seller/pos/sales')).send({ sales: [first, conflict, bad] });
    expect(res.status).toBe(200);
    const [r1, r2, r3] = res.body.data.results;
    expect(r1).toMatchObject({ clientId: first.clientId, status: 'created', stockConflict: false });
    // Only 1 unit left: the sale is still recorded, stock clamps at 0 and the conflict is flagged.
    expect(r2).toMatchObject({ status: 'created', stockConflict: true });
    expect(r3).toMatchObject({ status: 'error', error: { code: 'VARIANT_NOT_FOUND' } });
    expect((await Product.findById(item.productId).lean())!.variants[0]!.stock).toBe(0);
    const note = await StockMovement.findOne({ productId: item.productId, note: /POS stock conflict/ }).lean();
    expect(note?.note).toBe('POS stock conflict: sold 4, had 1');

    // Re-sync (offline retry) is idempotent.
    res = await s.agent.post(api('/seller/pos/sales')).send({ sales: [first] });
    expect(res.body.data.results[0]).toMatchObject({ status: 'duplicate', orderId: r1.orderId });
    expect(await Order.countDocuments({ storeId: s.store._id, channel: 'pos' })).toBe(2);
    const o = await Order.findById(r1.orderId).lean();
    expect(o).toMatchObject({ channel: 'pos', status: 'delivered', total: 200_000, buyerId: null, commission: { amount: 0 } });
    expect(o!.pos).toMatchObject({ change: 50_000, stockConflict: false });
    // POS cash never enters the seller ledger.
    expect(await SellerLedger.countDocuments({ storeId: s.store._id })).toBe(0);

    // Receipt + public digital receipt (no customer PII).
    res = await s.agent.get(api(`/seller/pos/sales/${r1.orderId}/receipt`));
    expect(res.body.data).toMatchObject({ total: 200_000, change: 50_000, store: { name: 'POS Pro' } });
    expect(res.body.data.qr).toMatch(/^data:image\/png;base64,/);
    const token = res.body.data.digitalReceiptUrl.split('/r/')[1];
    res = await xhr().get(api(`/r/${token}`));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ total: 200_000, store: { name: 'POS Pro' } });
    expect(res.body.data.customer).toBeUndefined();
    expect((await xhr().get(api(`/r/${r1.orderId}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`))).status).toBe(404);

    // Close: expected = 50,000 opening + 200,000 cash (250,000 paid − 50,000 change); card sale excluded.
    res = await s.agent.post(api(`/seller/pos/shifts/${shiftId}/close`)).send({ countedCash: 249_000 });
    expect(res.body.data).toMatchObject({ status: 'closed', expectedCash: 250_000, variance: -1_000, cashSales: 200_000, salesCount: 2 });
    expect((await s.agent.post(api(`/seller/pos/shifts/${shiftId}/close`)).send({ countedCash: 1 })).body.error.code).toBe('SHIFT_CLOSED');
    expect((await s.agent.get(api('/seller/pos/shifts'))).body.data).toHaveLength(1);
  });

  it('tenant isolation: other store cannot sell, read receipts, close shifts or use foreign variants', async () => {
    const a = await makeSeller('POS Tenant A');
    const b = await makeSeller('POS Tenant B');
    await setPlan(a.store._id, 'pro');
    await setPlan(b.store._id, 'pro');
    const itemA = await makeItem(a.store._id, 50_000, 5);
    const shiftA = (await a.agent.post(api('/seller/pos/shifts/open')).send({ openingCash: 0 })).body.data.id;
    const saleA = (await a.agent.post(api('/seller/pos/sales')).send({ sales: [sale(itemA.variantId, { price: 50_000 })] })).body.data.results[0];

    expect((await b.agent.get(api('/seller/pos/catalog'))).body.data).toEqual([]);
    expect((await b.agent.get(api(`/seller/pos/sales/${saleA.orderId}/receipt`))).status).toBe(404);
    expect((await b.agent.post(api(`/seller/pos/shifts/${shiftA}/close`)).send({ countedCash: 0 })).status).toBe(404);
    const res = await b.agent.post(api('/seller/pos/sales')).send({ sales: [sale(itemA.variantId, { price: 1 }), sale(itemA.variantId, { shiftId: shiftA })] });
    expect(res.body.data.results.map((r: { error?: { code: string } }) => r.error?.code)).toEqual(['VARIANT_NOT_FOUND', 'SHIFT_NOT_FOUND']);
    expect((await Product.findById(itemA.productId).lean())!.variants[0]!.stock).toBe(4);
    expect((await b.agent.get(api('/seller/pos/shifts')).set('x-store-id', String(a.store._id))).status).toBe(403);
  });
});
