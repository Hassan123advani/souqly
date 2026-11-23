import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { RiderCashEntry } from '../delivery/delivery.model';
import { safeNextPath, issueGoogle2faTicket } from '../auth/auth.service';
import { Token } from '../auth/token.model';
import { Category } from '../catalog/category.model';
import { Conversation } from '../chat/chat.models';
import { CoinTransaction } from '../loyalty/loyalty.models';
import { coinsForRefund, refundOrderCoins } from '../loyalty/coinsRefund';
import { Order } from '../orders/order.model';
import { addStaff, api, makeBuyer, makeItem, makeSeller } from '../orders/orderTestFixtures';
import { Question } from '../qa/question.model';
import { User } from '../users/user.model';
import { placeOrder } from '../loyalty/socialTestFixtures';
import { newAgent } from '../../test/helpers';

async function buyerWithCoins(coins: number) {
  const b = await makeBuyer();
  await User.updateOne({ _id: b.user._id }, { $set: { coins } });
  return b;
}
const coinsOf = async (id: unknown) => (await User.findById(id).select('coins').lean())!.coins;

describe('A1 coins refund', () => {
  it('buyer cancel refunds the coins once (idempotent ref coins-refund:<orderId>)', async () => {
    const seller = await makeSeller('Coin Store');
    const item = await makeItem(seller.store._id, 100_000);
    const b = await buyerWithCoins(500);
    const placed = await placeOrder(b, [{ productId: item.productId, variantId: item.variantId, qty: 1 }], { coins: 500 });
    expect(await coinsOf(b.user._id)).toBe(0);
    const order = await Order.findById(placed.orders[0]!.id).lean();
    expect(order!.coinsUsed).toBe(500);
    expect(order!.discounts.coins).toBe(5_000);

    const dto = (await b.agent.get(api(`/orders/${order!.number}`))).body.data;
    expect(dto.discounts.coins).toBe(5_000);
    expect(dto.items[0].slug).toBeTruthy();
    expect(dto.canCancel).toBe(true);

    const res = await b.agent.post(api(`/orders/${order!.number}/cancel`)).send({ reason: 'Changed my mind' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await coinsOf(b.user._id)).toBe(500);
    // A second refund attempt is a no-op.
    expect(await refundOrderCoins((await Order.findById(order!._id).lean())!)).toBe(0);
    expect(await coinsOf(b.user._id)).toBe(500);
    expect(await CoinTransaction.countDocuments({ ref: `coins-refund:${order!._id}` })).toBe(1);
  });

  it('seller cancel refunds coins too', async () => {
    const seller = await makeSeller('Coin Store 2');
    const item = await makeItem(seller.store._id, 100_000);
    const b = await buyerWithCoins(300);
    const placed = await placeOrder(b, [{ productId: item.productId, variantId: item.variantId, qty: 1 }], { coins: 300 });
    const res = await seller.agent.post(api(`/seller/orders/${placed.orders[0]!.id}/status`)).send({ to: 'cancelled', reason: 'Out of stock' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await coinsOf(b.user._id)).toBe(300);
  });

  it('partial return refunds coins proportionally', () => {
    const o = { _id: new Types.ObjectId(), buyerId: new Types.ObjectId(), coinsUsed: 500, subtotal: 100_000, discounts: { coins: 5_000 } };
    expect(coinsForRefund(o, 40_000)).toBe(200);
    expect(coinsForRefund(o, 100_000)).toBe(500);
    expect(coinsForRefund(o)).toBe(500);
    // Older orders without coinsUsed derive it from the discount.
    expect(coinsForRefund({ ...o, coinsUsed: 0 }, 50_000)).toBe(250);
  });
});

describe('A2 seller dashboard todo', () => {
  it('counts unread chats and unanswered questions', async () => {
    const seller = await makeSeller('Todo Store');
    const item = await makeItem(seller.store._id, 10_000);
    const b = await makeBuyer();
    await Conversation.create({ buyerId: b.user._id, storeId: seller.store._id, unread: { buyer: 0, store: 3 }, lastMessageAt: new Date() });
    await Question.create({ productId: item.product._id, storeId: seller.store._id, askerId: b.user._id, text: 'Is this cotton?', answered: false, status: 'published' } as never);
    const res = await seller.agent.get(api('/seller/dashboard'));
    expect(res.status).toBe(200);
    expect(res.body.data.todo.unreadChats).toBe(3);
    expect(res.body.data.todo.unansweredQuestions).toBe(1);
  });
});

describe('A4 cart select-store', () => {
  it('(de)selects only that store’s items', async () => {
    const s1 = await makeSeller('Sel One');
    const s2 = await makeSeller('Sel Two');
    const i1 = await makeItem(s1.store._id, 10_000);
    const i2 = await makeItem(s2.store._id, 10_000);
    const b = await makeBuyer();
    await b.agent.post(api('/cart/items')).send({ productId: i1.productId, variantId: i1.variantId, qty: 1 });
    await b.agent.post(api('/cart/items')).send({ productId: i2.productId, variantId: i2.variantId, qty: 1 });
    const res = await b.agent.post(api('/cart/select-store')).send({ storeId: String(s1.store._id), selected: false });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const items = res.body.data.groups.flatMap((g: { store: { id: string }; items: { selected: boolean }[] }) => g.items.map((i) => ({ store: g.store.id, selected: i.selected })));
    expect(items.find((i: { store: string }) => i.store === String(s1.store._id)).selected).toBe(false);
    expect(items.find((i: { store: string }) => i.store === String(s2.store._id)).selected).toBe(true);
    expect((await b.agent.post(api('/cart/select-store')).send({ storeId: 'nope', selected: true })).status).toBe(400);
  });
});

describe('A5 COD settlement race', () => {
  it('two concurrent settlements of more than half never over-settle', async () => {
    const seller = await makeSeller('Cash Store');
    const rider = await addStaff(seller.store._id, 'RIDER');
    await RiderCashEntry.create({ storeId: seller.store._id, riderId: rider.user._id, type: 'collected', amount: 1_000, by: rider.user._id });
    const url = api(`/seller/riders/${rider.member._id}/cod-settle`);
    const results = await Promise.all([seller.agent.post(url).send({ amount: 800 }), seller.agent.post(url).send({ amount: 800 })]);
    expect(results.filter((r) => r.status === 201).length).toBeLessThanOrEqual(1);
    const settled = await RiderCashEntry.aggregate([{ $match: { riderId: rider.user._id, type: 'settled' } }, { $group: { _id: null, n: { $sum: '$amount' } } }]);
    expect(settled[0]?.n ?? 0).toBeLessThanOrEqual(1_000);
  });
});

describe('A6 Google 2FA next', () => {
  it('only accepts relative paths and stores next on the ticket', async () => {
    expect(safeNextPath('/account/orders?tab=1')).toBe('/account/orders?tab=1');
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', '/a\nb', '']) expect(safeNextPath(bad)).toBeUndefined();
    const b = await makeBuyer();
    const ticket = await issueGoogle2faTicket(b.user._id, '/checkout');
    expect(ticket).toBeTruthy();
    expect((await Token.findOne({ userId: b.user._id, type: 'google_2fa' }).lean())!.next).toBe('/checkout');
    await issueGoogle2faTicket(b.user._id, '//evil.com');
    expect((await Token.findOne({ userId: b.user._id, type: 'google_2fa', usedAt: null }).lean())!.next).toBeUndefined();
  });
});

describe('A7 flags + payment toggles in /config/public', () => {
  it('exposes chat/returns flags', async () => {
    const res = await newAgent().get(api('/config/public'));
    expect(res.body.data.flags).toMatchObject({ chat: true, returns: true });
    expect(res.body.data.integrations.payments.cod).toBe(true);
  });
});

describe('Seller Center follow-ups (8-12)', () => {
  it('product list counts, bulk publish/archive, riders for order staff, all attributes, newOrderSound', async () => {
    const seller = await makeSeller('Bulk Store');
    const a = await makeItem(seller.store._id, 10_000, 5, { status: 'draft' } as never);
    const c = await makeItem(seller.store._id, 10_000, 5);
    const list = await seller.agent.get(api('/seller/products'));
    expect(list.status).toBe(200);
    expect(list.body.meta.counts.all).toBe(2);

    const bulk = await seller.agent.post(api('/seller/products/bulk')).send({ ids: [a.productId, c.productId, new Types.ObjectId().toString()], action: 'archive' });
    expect(bulk.status, JSON.stringify(bulk.body)).toBe(200);
    expect(bulk.body.data.ok).toHaveLength(2);
    expect(bulk.body.data.failed).toHaveLength(1);
    expect((await seller.agent.get(api('/seller/products'))).body.meta.counts.archived).toBe(2);

    const orders = await addStaff(seller.store._id, 'ORDERS');
    const riders = await orders.agent.get(api('/seller/orders/riders'));
    expect(riders.status).toBe(200);
    expect(Array.isArray(riders.body.data)).toBe(true);

    const cat = await Category.findOne({ parentId: { $ne: null } }).lean();
    await Category.updateOne({ _id: cat!._id }, { $push: { attributes: { key: 'care_notes', label: { en: 'Care', ur: '', ar: '' }, type: 'text', filterable: false } } });
    const { invalidateCategoryCache } = await import('../catalog/catalog.service');
    invalidateCategoryCache();
    const attrs = await newAgent().get(api(`/catalog/categories/${cat!.slug}/attributes`));
    expect(attrs.status).toBe(200);
    expect(attrs.body.data.map((x: { key: string }) => x.key)).toContain('care_notes');

    const put = await seller.agent.put(api('/seller/settings/notifications')).send({ newOrderSound: false });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    const get = await seller.agent.get(api('/seller/settings/notifications'));
    expect(get.body.data.newOrderSound).toBe(false);
  });
});

describe('Phase 7 follow-ups (14-15)', () => {
  it('rider lists include RIDER / delivery CUSTOM roles only; returns list has meta.counts', async () => {
    const seller = await makeSeller('Rider List Store');
    const rider = await addStaff(seller.store._id, 'RIDER');
    const manager = await addStaff(seller.store._id, 'MANAGER');
    for (const url of ['/seller/riders', '/seller/orders/riders']) {
      const res = await seller.agent.get(api(url));
      expect(res.status).toBe(200);
      const ids = res.body.data.map((r: { memberId: string }) => r.memberId);
      expect(ids).toContain(String(rider.member._id));
      expect(ids).not.toContain(String(manager.member._id));
      expect(res.body.data.map((r: { user: { id: string } }) => r.user.id)).not.toContain(String(seller.owner._id));
    }
    const returns = await seller.agent.get(api('/seller/returns'));
    expect(returns.status).toBe(200);
    expect(returns.body.meta.counts).toMatchObject({ all: 0, requested: 0, escalated: 0 });
  });
});

describe('16 CORS / socket origins', () => {
  it('dev accepts CLIENT_URL + any local http port; production is strict to CLIENT_URL + CORS_EXTRA_ORIGINS', async () => {
    const { makeOriginCheck } = await import('../../config/origins');
    const dev = makeOriginCheck({ production: false, clientUrl: 'http://localhost:5173' });
    for (const ok of ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:4173', 'http://localhost']) expect(dev(ok)).toBe(true);
    for (const bad of ['https://evil.example', 'http://localhost.evil.com', 'http://evil.com:5173', 'http://127.0.0.2:5173', 'https://localhost:5174', 'null']) expect(dev(bad)).toBe(false);

    const prod = makeOriginCheck({ production: true, clientUrl: 'https://souqly.pk', extra: 'https://admin.souqly.pk, https://www.souqly.pk/' });
    expect(prod('https://souqly.pk')).toBe(true);
    expect(prod('https://admin.souqly.pk')).toBe(true);
    expect(prod('https://www.souqly.pk')).toBe(true);
    expect(prod('http://localhost:5173')).toBe(false);
    expect(prod('https://evil.example')).toBe(false);

    // Express CORS (test env = non-production): a fallback Vite port gets credentials-enabled CORS headers.
    const ok = await newAgent().get(api('/health')).set('Origin', 'http://localhost:5174');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5174');
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const bad = await newAgent().get(api('/health')).set('Origin', 'https://evil.example');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();

    const { isAllowedSocketOrigin } = await import('../../socket');
    expect(isAllowedSocketOrigin('http://127.0.0.1:5175')).toBe(true);
    expect(isAllowedSocketOrigin('https://evil.example')).toBe(false);
  });
});

describe('17-19 chat conversation detail, order cards, buyer store filter', () => {
  it('works with tenant isolation', async () => {
    const seller = await makeSeller('Chat Orders Store');
    const other = await makeSeller('Other Chat Store');
    const item = await makeItem(seller.store._id, 10_000);
    const otherItem = await makeItem(other.store._id, 10_000);
    const b = await makeBuyer();
    const placed = await placeOrder(b, [{ productId: item.productId, variantId: item.variantId, qty: 1 }]);
    await placeOrder(b, [{ productId: otherItem.productId, variantId: otherItem.variantId, qty: 1 }]);

    const conv = await b.agent.post(api('/chat/conversations')).send({ storeSlug: seller.store.slug });
    expect([200, 201]).toContain(conv.status);
    const id = conv.body.data.id as string;
    const mine = await b.agent.get(api(`/chat/conversations/${id}`));
    expect(mine.status).toBe(200);
    expect(mine.body.data.id).toBe(id);
    expect((await (await makeBuyer()).agent.get(api(`/chat/conversations/${id}`))).status).toBe(404);

    const sv = await seller.agent.get(api(`/seller/chat/conversations/${id}`));
    expect(sv.status).toBe(200);
    expect((await other.agent.get(api(`/seller/chat/conversations/${id}`))).status).toBe(404);
    const orders = await seller.agent.get(api(`/seller/chat/conversations/${id}/orders`));
    expect(orders.status).toBe(200);
    expect(orders.body.data.map((o: { number: string }) => o.number)).toEqual([placed.orders[0]!.number]);
    expect((await other.agent.get(api(`/seller/chat/conversations/${id}/orders`))).status).toBe(404);

    const byId = await b.agent.get(api(`/orders?store=${seller.store._id}`));
    expect(byId.body.data.map((o: { number: string }) => o.number)).toEqual([placed.orders[0]!.number]);
    const bySlug = await b.agent.get(api(`/orders?store=${seller.store.slug}`));
    expect(bySlug.body.data).toHaveLength(1);
    expect((await b.agent.get(api('/orders?store=no-such-store'))).body.data).toHaveLength(0);
    expect((await b.agent.get(api('/orders'))).body.data).toHaveLength(2);
  });
});

describe('20 coins in the checkout summary', () => {
  it('coinsDiscount is separate from discountTotal and total adds up', async () => {
    const seller = await makeSeller('Summary Store');
    const item = await makeItem(seller.store._id, 100_000);
    const b = await buyerWithCoins(400);
    await b.agent.post(api('/cart/items')).send({ productId: item.productId, variantId: item.variantId, qty: 1 });
    const res = await b.agent.post(api('/checkout/preview')).send({ addressId: b.addressId, paymentMethod: 'cod', coins: 400 });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const s = res.body.data.summary;
    expect(s.coinsDiscount).toBe(4_000);
    expect(s.coinsUsed).toBe(400);
    expect(s.total).toBe(s.itemsSubtotal + s.shippingTotal - s.discountTotal - s.coinsDiscount);
    expect((await b.agent.get(api('/cart'))).body.data.summary.coinsDiscount).toBe(0);
  });
});
