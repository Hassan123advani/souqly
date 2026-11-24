import { beforeAll, describe, expect, it } from 'vitest';
import { Product } from '../catalog/product.model';
import { Cart } from '../cart/cart.model';
import { CommissionRule } from '../commission/commission.model';
import { Order } from '../orders/order.model';
import { reserveAll } from '../orders/stock';
import { api, key, makeBuyer, makeItem, makeSeller } from '../orders/orderTestFixtures';
import { Voucher, VoucherUsage } from '../vouchers/voucher.model';
import { Checkout } from './checkout.model';

const day = 86_400_000;

beforeAll(async () => {
  await CommissionRule.create({ scope: 'global', bps: 1000 });
  await Voucher.create([
    { code: 'SOUQLY10', scope: 'platform', storeId: null, type: 'percent', value: 1000, minSpend: 150_000, maxDiscount: 50_000, startsAt: new Date(Date.now() - day), endsAt: new Date(Date.now() + 30 * day), perUserLimit: 1 },
    { code: 'EXPIRED', scope: 'platform', storeId: null, type: 'fixed', value: 1000, startsAt: new Date(Date.now() - 2 * day), endsAt: new Date(Date.now() - day) },
  ]);
});

async function stockOf(productId: string) {
  return (await Product.findById(productId).lean())!.variants[0]!.stock;
}

describe('cart', () => {
  it('adds, updates, groups by store, detects issues and merges', async () => {
    const b = await makeBuyer();
    const s1 = await makeSeller('Cart Store One');
    const s2 = await makeSeller('Cart Store Two', 'Karachi');
    const a = await makeItem(s1.store._id, 100_000, 5);
    const c = await makeItem(s2.store._id, 50_000, 3);

    let res = await b.agent.post(api('/cart/items')).send({ productId: a.productId, variantId: a.variantId, qty: 2 });
    expect(res.status).toBe(201);
    res = await b.agent.post(api('/cart/merge')).send({ items: [{ productId: c.productId, variantId: c.variantId, qty: 1 }, { productId: a.productId, variantId: a.variantId, qty: 1 }] });
    expect(res.status).toBe(200);
    const cart = res.body.data;
    expect(cart.groups).toHaveLength(2);
    expect(cart.groups[0].items[0].qty).toBe(2); // merge keeps max(existing, guest)
    // Lahore buyer: same-city Rs.150 for store 1, other-city Rs.250 for store 2.
    expect(cart.groups.map((g: { shipping: number }) => g.shipping)).toEqual([15_000, 25_000]);
    expect(cart.summary).toMatchObject({ itemsSubtotal: 250_000, shippingTotal: 40_000, total: 290_000 });

    // Stock drops below the cart qty → qty_reduced; price change → price_changed.
    await Product.updateOne({ _id: a.productId }, { $set: { 'variants.0.stock': 1, 'variants.0.price': 90_000 } });
    res = await b.agent.get(api('/cart'));
    const types = res.body.data.issues.map((i: { type: string }) => i.type).sort();
    expect(types).toEqual(['price_changed', 'qty_reduced']);
    expect(res.body.data.groups[0].items[0]).toMatchObject({ qty: 1, maxQty: 1, price: 90_000 });
    // Issues are reported once (snapshot updated).
    expect((await b.agent.get(api('/cart'))).body.data.issues).toEqual([]);

    // Save for later moves it out of the groups.
    const itemId = res.body.data.groups[1].items[0].id;
    res = await b.agent.patch(api(`/cart/items/${itemId}`)).send({ savedForLater: true });
    expect(res.body.data.savedForLater).toHaveLength(1);
    expect(res.body.data.groups).toHaveLength(1);

    res = await b.agent.post(api('/cart/select-all')).send({ selected: false });
    expect(res.body.data.summary.total).toBe(0);
    res = await b.agent.delete(api(`/cart/items/${itemId}`));
    expect(res.body.data.savedForLater).toHaveLength(0);
  });

  it('applies and removes vouchers with clear errors', async () => {
    const b = await makeBuyer();
    const s = await makeSeller('Voucher Store');
    const cheap = await makeItem(s.store._id, 100_000, 10);
    await b.agent.post(api('/cart/items')).send({ productId: cheap.productId, variantId: cheap.variantId, qty: 1 });

    let res = await b.agent.post(api('/cart/vouchers')).send({ code: 'souqly10' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VOUCHER_MIN_SPEND');
    expect((await b.agent.post(api('/cart/vouchers')).send({ code: 'EXPIRED' })).body.error.code).toBe('VOUCHER_EXPIRED');
    expect((await b.agent.post(api('/cart/vouchers')).send({ code: 'NOPE123' })).status).toBe(404);

    await b.agent.post(api('/cart/items')).send({ productId: cheap.productId, variantId: cheap.variantId, qty: 1 });
    res = await b.agent.post(api('/cart/vouchers')).send({ code: 'SOUQLY10' });
    expect(res.status).toBe(200);
    expect(res.body.data.summary.platformVoucher).toMatchObject({ code: 'SOUQLY10', valid: true, discount: 20_000 });
    res = await b.agent.delete(api('/cart/vouchers/SOUQLY10'));
    expect(res.body.data.summary.platformVoucher).toBeUndefined();
  });
});

describe('checkout', () => {
  it('splits one checkout into one order per store with commission, voucher and stock bookkeeping', async () => {
    const b = await makeBuyer();
    const s1 = await makeSeller('Split One');
    const s2 = await makeSeller('Split Two', 'Karachi');
    // A legacy store rule is ignored: commission is a flat 15% for every store (docs/api-billing.md).
    await CommissionRule.create({ scope: 'store', storeId: s2.store._id, bps: 500 });
    const a = await makeItem(s1.store._id, 100_000, 5);
    const c = await makeItem(s2.store._id, 200_000, 5);
    await b.agent.post(api('/cart/items')).send({ productId: a.productId, variantId: a.variantId, qty: 1 });
    await b.agent.post(api('/cart/items')).send({ productId: c.productId, variantId: c.variantId, qty: 1 });
    await b.agent.post(api('/cart/vouchers')).send({ code: 'SOUQLY10' });

    const preview = await b.agent.post(api('/checkout/preview')).send({ addressId: b.addressId, paymentMethod: 'cod' });
    expect(preview.status).toBe(200);
    expect(preview.body.data).toMatchObject({ canPlace: true, summary: { itemsSubtotal: 300_000, discountTotal: 30_000 } });

    const res = await b.agent.post(api('/checkout')).send({ addressId: b.addressId, paymentMethod: 'cod', idempotencyKey: key(), notes: { [String(s1.store._id)]: 'Please gift wrap' } });
    expect(res.status).toBe(201);
    const co = res.body.data;
    expect(co.number).toMatch(/^SQ-\d{6}-[A-Z0-9]{5}$/);
    expect(co.orders.map((o: { number: string }) => o.number)).toEqual([`${co.number}-A`, `${co.number}-B`]);
    // 10% of 300_000 = 30_000, prorated 1:2 by subtotal; shipping Rs.150 same city + Rs.250 other city.
    expect(co.orders.map((o: { discounts: { platform: number } }) => o.discounts.platform)).toEqual([10_000, 20_000]);
    expect(co.orders.map((o: { shippingFee: number }) => o.shippingFee)).toEqual([15_000, 25_000]);
    expect(co.totals.total).toBe(300_000 - 30_000 + 40_000);
    expect(co.orders[0]).toMatchObject({ status: 'placed', buyerNote: 'Please gift wrap', payment: { method: 'cod', status: 'pending' } });
    expect(co.orders[0].commission).toBeUndefined(); // buyer view hides commission

    const orders = await Order.find({ number: { $in: co.orders.map((o: { number: string }) => o.number) } }).sort({ number: 1 }).lean();
    // Platform voucher is platform-funded: the base stays the full item value; shipping is excluded.
    expect(orders.map((o) => o.commission)).toEqual([
      { bps: 1500, amount: 15_000 },
      { bps: 1500, amount: 30_000 },
    ]);
    expect(orders[0]!.sellerNet).toBe(100_000 + 15_000 - 15_000);
    expect(orders[0]!.timeline[0]).toMatchObject({ status: 'placed', actor: 'buyer' });

    expect(await stockOf(a.productId)).toBe(4);
    expect((await Product.findById(c.productId).lean())!.soldCount).toBe(1);
    expect((await Cart.findOne({ userId: b.user._id }).lean())!.items).toHaveLength(0);
    expect((await Voucher.findOne({ code: 'SOUQLY10' }).lean())!.usedCount).toBe(1);
    expect(await VoucherUsage.countDocuments({ userId: b.user._id })).toBe(1);

    // Per-user limit reached.
    await b.agent.post(api('/cart/items')).send({ productId: c.productId, variantId: c.variantId, qty: 1 });
    expect((await b.agent.post(api('/cart/vouchers')).send({ code: 'SOUQLY10' })).body.error.code).toBe('VOUCHER_USED');

    // Success page only for the owner.
    expect((await b.agent.get(api(`/checkout/${co.number}`))).status).toBe(200);
    const other = await makeBuyer();
    expect((await other.agent.get(api(`/checkout/${co.number}`))).status).toBe(404);
  });

  it('is idempotent per user + key', async () => {
    const b = await makeBuyer();
    const s = await makeSeller('Idem Store');
    const a = await makeItem(s.store._id, 50_000, 5);
    await b.agent.post(api('/cart/items')).send({ productId: a.productId, variantId: a.variantId, qty: 2 });
    const k = key();
    const body = { addressId: b.addressId, paymentMethod: 'cod', idempotencyKey: k };
    const [r1, r2] = await Promise.all([b.agent.post(api('/checkout')).send(body), b.agent.post(api('/checkout')).send(body)]);
    expect([r1.status, r2.status].sort()).toEqual([200, 201]);
    expect(r1.body.data.number).toBe(r2.body.data.number);
    const r3 = await b.agent.post(api('/checkout')).send(body);
    expect(r3.status).toBe(200);
    expect(r3.body.data.number).toBe(r1.body.data.number);
    expect(await Checkout.countDocuments({ userId: b.user._id })).toBe(1);
    expect(await Order.countDocuments({ buyerId: b.user._id })).toBe(1);
    expect(await stockOf(a.productId)).toBe(3);
  });

  it('never oversells: parallel checkouts on the last unit → exactly one wins', async () => {
    const s = await makeSeller('Race Store');
    const a = await makeItem(s.store._id, 70_000, 1);
    const buyers = await Promise.all(Array.from({ length: 6 }, () => makeBuyer()));
    for (const b of buyers) await b.agent.post(api('/cart/items')).send({ productId: a.productId, variantId: a.variantId, qty: 1 });
    const results = await Promise.all(buyers.map((b) => b.agent.post(api('/checkout')).send({ addressId: b.addressId, paymentMethod: 'cod', idempotencyKey: key() })));
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    for (const r of results.filter((x) => x.status !== 201)) {
      expect(r.status).toBe(409);
      expect(['STOCK_CHANGED', 'CART_CHANGED']).toContain(r.body.error.code);
    }
    expect(await stockOf(a.productId)).toBe(0);
    expect(await Order.countDocuments({ storeId: s.store._id })).toBe(1);
    // Failed attempts leave no checkout behind (their keys stay reusable).
    expect(await Checkout.countDocuments({ userId: { $in: buyers.map((b) => b.user._id) } })).toBe(1);
  });

  it('rolls back every line when one line of a multi-item checkout is short', async () => {
    const b = await makeBuyer();
    const s = await makeSeller('Rollback Store');
    const ok = await makeItem(s.store._id, 10_000, 5);
    const short = await makeItem(s.store._id, 10_000, 2);
    await b.agent.post(api('/cart/items')).send({ productId: ok.productId, variantId: ok.variantId, qty: 2 });
    await b.agent.post(api('/cart/items')).send({ productId: short.productId, variantId: short.variantId, qty: 2 });
    // Stock fell after the cart was priced: the quote clamps qty → buyer must review (nothing reserved).
    await Product.updateOne({ _id: short.productId }, { $set: { 'variants.0.stock': 1 } });
    const res = await b.agent.post(api('/checkout')).send({ addressId: b.addressId, paymentMethod: 'cod', idempotencyKey: key() });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CART_CHANGED');
    expect(await stockOf(ok.productId)).toBe(5);

    // Reservation itself is all-or-nothing (the race window between quote and reserve).
    const lines = [
      { productId: ok.product._id, variantId: ok.product.variants[0]!._id, storeId: s.store._id, qty: 2 },
      { productId: short.product._id, variantId: short.product.variants[0]!._id, storeId: s.store._id, qty: 2 },
    ];
    const r = await reserveAll(lines);
    expect(r.ok).toBe(false);
    expect(await stockOf(ok.productId)).toBe(5);
    expect(await stockOf(short.productId)).toBe(1);
    expect((await Product.findById(ok.productId).lean())!.soldCount).toBe(0);
  });

  it('only allows COD and validates the address owner', async () => {
    const b = await makeBuyer();
    const other = await makeBuyer();
    const s = await makeSeller('Pay Store');
    const a = await makeItem(s.store._id, 10_000, 5);
    await b.agent.post(api('/cart/items')).send({ productId: a.productId, variantId: a.variantId, qty: 1 });
    const card = await b.agent.post(api('/checkout')).send({ addressId: b.addressId, paymentMethod: 'stripe', idempotencyKey: key() });
    expect(card.status).toBe(400);
    expect(card.body.error.code).toBe('PAYMENT_NOT_CONFIGURED');
    const foreign = await b.agent.post(api('/checkout')).send({ addressId: other.addressId, paymentMethod: 'cod', idempotencyKey: key() });
    expect(foreign.status).toBe(404);
    const empty = await other.agent.post(api('/checkout')).send({ addressId: other.addressId, paymentMethod: 'cod', idempotencyKey: key() });
    expect(empty.body.error.code).toBe('CART_EMPTY');
    expect(await stockOf(a.productId)).toBe(5);
  });
});
