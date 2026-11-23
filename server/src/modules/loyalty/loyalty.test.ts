import { describe, expect, it, beforeAll } from 'vitest';
import { computePricing } from '../orders/pricing';
import { api, makeBuyer, makeItem, makeSeller } from '../orders/orderTestFixtures';
import { Order } from '../orders/order.model';
import { User } from '../users/user.model';
import { newAgent, uniqueEmail } from '../../test/helpers';
import { Address } from '../account/address.model';
import { credit, debit } from '../wallet/wallet.service';
import { WalletTransaction } from '../wallet/walletTransaction.model';
import { checkIn, dayKey } from './coins.service';
import { CoinTransaction, GiftCard } from './loyalty.models';
import { coinsRedemption, coinsForOrderTotal } from './redemption';
import { earnCoinsForOrder, rewardReferral } from './rewards.service';
import { deliver, placeOrder } from './socialTestFixtures';

let seller: Awaited<ReturnType<typeof makeSeller>>;
let item: Awaited<ReturnType<typeof makeItem>>;

beforeAll(async () => {
  seller = await makeSeller('Loyalty Store');
  item = await makeItem(seller.store._id, 250_000, 100); // Rs. 2,500
});

describe('wallet', () => {
  it('credits / debits are idempotent per ref and never go negative', async () => {
    const b = await makeBuyer();
    const uid = String(b.user._id);
    expect((await credit({ userId: uid, amount: 10_000, reason: 'refund', ref: 'test:r1' })).applied).toBe(true);
    const again = await credit({ userId: uid, amount: 10_000, reason: 'refund', ref: 'test:r1' });
    expect(again).toMatchObject({ applied: false, balance: 10_000 });
    await expect(debit({ userId: uid, amount: 50_000, reason: 'order_payment', ref: 'test:d1' })).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
    expect(await WalletTransaction.countDocuments({ ref: 'test:d1' })).toBe(0);
    expect((await debit({ userId: uid, amount: 4_000, reason: 'order_payment', ref: 'test:d2' })).balance).toBe(6_000);
    // Concurrent duplicates apply once.
    await Promise.all(Array.from({ length: 5 }, () => credit({ userId: uid, amount: 1_000, reason: 'refund', ref: 'test:r2' })));
    expect((await User.findById(uid).lean())!.walletBalance).toBe(7_000);

    const res = await b.agent.get(api('/wallet/transactions?limit=2'));
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.nextCursor).toBeTruthy();
    expect((await b.agent.get(api('/wallet'))).body.data.balance).toBe(7_000);
  });
});

describe('coins', () => {
  it('redemption rule: 100 coins = Rs. 10, max 20% and balance', () => {
    expect(coinsRedemption({ requested: 1_000, balance: 5_000, orderTotal: 100_000 })).toEqual({ coinsUsed: 1_000, discount: 10_000, maxCoins: 2_000 });
    expect(coinsRedemption({ requested: 9_999, balance: 5_000, orderTotal: 100_000 }).coinsUsed).toBe(2_000); // 20% of Rs. 1,000 = Rs. 200
    expect(coinsRedemption({ requested: 9_999, balance: 300, orderTotal: 100_000 }).coinsUsed).toBe(300);
    expect(coinsRedemption({ requested: 0, balance: 300, orderTotal: 100_000 }).coinsUsed).toBe(0);
    expect(coinsForOrderTotal(259_999)).toBe(25);
  });

  it('pricing applies coins after vouchers/shipping, prorated across stores', () => {
    const line = (id: string, storeId: string, basePrice: number) => ({ id, storeId, productId: id, categoryPath: [], basePrice, qty: 1 });
    const r = computePricing({
      lines: [line('a', 's1', 60_000), line('b', 's2', 40_000)],
      shipping: { s1: { rate: 0 }, s2: { rate: 0 } },
      coins: 50_000,
      coinsBalance: 50_000,
    });
    expect(r.coinsUsed).toBe(2_000);
    expect(r.coins).toBe(20_000);
    expect(r.total).toBe(80_000);
    expect(r.stores.map((s) => s.coinsDiscount)).toEqual([12_000, 8_000]);
    expect(r.stores.reduce((a, s) => a + s.total, 0)).toBe(r.total);
    expect(computePricing({ lines: [line('a', 's1', 60_000)], shipping: {}, coins: 100, coinsBalance: 0 }).coins).toBe(0);
    expect(computePricing({ lines: [line('a', 's1', 60_000)], shipping: {} }).coins).toBe(0);
  });

  it('earns coins once per delivered order', async () => {
    const b = await makeBuyer();
    const placed = await placeOrder(b, [{ productId: item.productId, variantId: item.variantId, qty: 1 }]);
    const id = placed.orders[0]!.id;
    await deliver(id);
    const order = await Order.findById(id).lean();
    const earned = coinsForOrderTotal(order!.total);
    expect(earned).toBeGreaterThanOrEqual(25);
    expect((await User.findById(b.user._id).lean())!.coins).toBe(earned);
    expect(await earnCoinsForOrder(order!)).toBe(0);
    expect(await CoinTransaction.countDocuments({ ref: `order:${id}` })).toBe(1);
    const res = await b.agent.get(api('/coins'));
    expect(res.body.data).toMatchObject({ balance: earned, worth: earned * 10 });
  });

  it('daily check-in: once per Karachi day, streak bonus on day 7', async () => {
    const b = await makeBuyer();
    const uid = String(b.user._id);
    const first = await b.agent.post(api('/coins/check-in'));
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ coins: 10, streak: 1 });
    expect((await b.agent.post(api('/coins/check-in'))).status).toBe(409);
    expect((await b.agent.get(api('/coins/check-in'))).body.data).toMatchObject({ checkedInToday: true, streak: 1 });

    const b2 = await makeBuyer();
    const uid2 = String(b2.user._id);
    const base = Date.UTC(2026, 0, 1, 12);
    let last = { coins: 0, streak: 0, balance: 0 };
    for (let d = 0; d < 7; d++) last = await checkIn(uid2, new Date(base + d * 86_400_000));
    expect(last).toMatchObject({ streak: 7, coins: 60, balance: 6 * 10 + 60 });
    // 23:30 PKT and 00:30 PKT next day are different days (UTC 18:30 / 19:30).
    expect(dayKey(new Date(Date.UTC(2026, 1, 1, 18, 30)))).toBe('2026-02-01');
    expect(dayKey(new Date(Date.UTC(2026, 1, 1, 19, 30)))).toBe('2026-02-02');
    void uid;
  });

  it('checkout preview and placement redeem coins atomically, capped at 20%', async () => {
    const b = await makeBuyer();
    await User.updateOne({ _id: b.user._id }, { $set: { coins: 10_000 } });
    await b.agent.post(api('/cart/items')).send({ productId: item.productId, variantId: item.variantId, qty: 1 });
    const pv = await b.agent.post(api('/checkout/preview')).send({ addressId: b.addressId, paymentMethod: 'cod', coins: 10_000 });
    expect(pv.status).toBe(200);
    const max = pv.body.data.coinsRedemption.max;
    expect(pv.body.data.coinsRedemption.used).toBe(max);
    expect(pv.body.data.coinsRedemption.discount).toBe(max * 10);
    expect(max * 10).toBeLessThanOrEqual(Math.floor((pv.body.data.summary.total + max * 10) * 0.2));

    const placed = await b.agent.post(api('/checkout')).send({ addressId: b.addressId, paymentMethod: 'cod', coins: 500, idempotencyKey: `coins-${Date.now()}` });
    expect(placed.status).toBe(201);
    expect((await User.findById(b.user._id).lean())!.coins).toBe(9_500);
    const order = await Order.findById(placed.body.data.orders[0].id).lean();
    expect(order!.discounts.coins).toBe(5_000);
    expect(order!.total).toBe(order!.subtotal + order!.shippingFee - 5_000);
  });
});

describe('referrals', () => {
  it('rewards referrer (wallet) and referee (coins) once on the first delivered order', async () => {
    const referrer = await makeBuyer();
    const code = (await User.findById(referrer.user._id).lean())!.referralCode;
    const agent = newAgent();
    const email = uniqueEmail('referee');
    const signup = await agent.post(api('/auth/signup')).send({ name: 'Referee', email, password: 'Passw0rd!', referralCode: code });
    expect(signup.status).toBe(201);
    const referee = (await User.findOne({ email }).lean())!;
    expect(String(referee.referredBy)).toBe(String(referrer.user._id));
    const address = await Address.create({ userId: referee._id, fullName: 'Referee', phone: '+923001234567', city: 'Lahore', line1: 'House 1, Street 2', isDefault: true });
    const b = { agent, user: referee, address, addressId: String(address._id), email } as unknown as Awaited<ReturnType<typeof makeBuyer>>;

    const o1 = await placeOrder(b, [{ productId: item.productId, variantId: item.variantId, qty: 1 }]);
    await deliver(o1.orders[0]!.id);
    const o2 = await placeOrder(b, [{ productId: item.productId, variantId: item.variantId, qty: 1 }]);
    await deliver(o2.orders[0]!.id);
    expect(await rewardReferral({ _id: o2.orders[0]!.id as never, buyerId: referee._id })).toBe(false);

    expect((await User.findById(referrer.user._id).lean())!.walletBalance).toBe(20_000);
    const totals = await Order.find({ _id: { $in: [o1.orders[0]!.id, o2.orders[0]!.id] } }).lean();
    expect((await User.findById(referee._id).lean())!.coins).toBe(500 + totals.reduce((a, o) => a + coinsForOrderTotal(o.total), 0));
    const summary = await referrer.agent.get(api('/referrals'));
    expect(summary.body.data).toMatchObject({ code, invited: 1, rewarded: 1, earned: 20_000 });
    expect(summary.body.data.shareUrl).toContain(code);
  });
});

describe('gift cards', () => {
  it('redeems once into the wallet; expired / unknown codes fail', async () => {
    await GiftCard.create({ code: 'TEST-GIFT-1000', amount: 100_000, balance: 100_000 });
    await GiftCard.create({ code: 'TEST-GIFT-OLD', amount: 100_000, balance: 100_000, expiresAt: new Date(Date.now() - 1000) });
    const a = await makeBuyer();
    const b = await makeBuyer();
    const results = await Promise.all([a, b].map((x) => x.agent.post(api('/gift-cards/redeem')).send({ code: 'test-gift-1000' })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    const winner = results[0]!.status === 200 ? a : b;
    expect((await User.findById(winner.user._id).lean())!.walletBalance).toBe(100_000);
    expect((await a.agent.post(api('/gift-cards/redeem')).send({ code: 'TEST-GIFT-OLD' })).status).toBe(400);
    expect((await a.agent.post(api('/gift-cards/redeem')).send({ code: 'NOPE-NOPE' })).status).toBe(400);
  });

  it('admin creation needs finance permission', async () => {
    const a = await makeBuyer();
    expect((await a.agent.post(api('/admin/gift-cards')).send({ amount: 50_000 })).status).toBe(403);
  });
});
