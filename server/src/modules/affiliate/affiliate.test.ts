import { beforeAll, describe, expect, it } from 'vitest';
import { setPlan } from '../../test/growthFixtures';
import { CommissionRule } from '../commission/commission.model';
import { Product } from '../catalog/product.model';
import { Order } from '../orders/order.model';
import { transitionOrder } from '../orders/order.service';
import { api, key, makeBuyer, makeItem, makeSeller } from '../orders/orderTestFixtures';
import { getBalance } from '../wallet/wallet.service';
import { WalletTransaction } from '../wallet/walletTransaction.model';
import { AffiliateCommission } from './affiliate.model';
import { creditAffiliateOnDelivery, releaseAffiliateCommissions } from './affiliate.service';

beforeAll(async () => {
  await CommissionRule.create({ scope: 'global', bps: 1000 });
});

async function deliver(orderId: unknown) {
  await Order.updateOne({ _id: orderId }, { $set: { status: 'out_for_delivery' } });
  return transitionOrder(orderId as never, 'delivered', { userId: null, kind: 'system' });
}

describe('affiliate links', () => {
  it('builds a link with the user code; commission recorded at checkout and paid once after the return window', async () => {
    const s = await makeSeller('Aff Store');
    const item = await makeItem(s.store._id, 100_000, 10);
    const affiliate = await makeBuyer();
    const link = await affiliate.agent.get(api(`/affiliate/link?productId=${item.productId}`));
    expect(link.status).toBe(200);
    const code = link.body.data.code;
    expect(link.body.data.url).toContain(`?aff=${code}`);
    expect(link.body.data.url).toContain((await Product.findById(item.productId).lean())!.slug);

    const buyer = await makeBuyer();
    await buyer.agent.post(api('/cart/items')).send({ productId: item.productId, variantId: item.variantId, qty: 2 });
    const res = await buyer.agent.post(api('/checkout')).send({ addressId: buyer.addressId, paymentMethod: 'cod', idempotencyKey: key(), aff: code });
    expect(res.status).toBe(201);
    const order = await Order.findOne({ storeId: s.store._id }).lean();
    expect(String(order!.affiliateUserId)).toBe(String(affiliate.user._id));
    const c = await AffiliateCommission.findOne({ orderId: order!._id }).lean();
    expect(c).toMatchObject({ base: 200_000, bps: 200, amount: 4_000, status: 'pending' });

    await deliver(order!._id);
    // Delivery only schedules the payout after the return window (D-091); nothing is paid yet.
    const scheduled = (await AffiliateCommission.findById(c!._id).lean())!;
    expect(scheduled.status).toBe('pending');
    expect(scheduled.releaseAt!.getTime()).toBeGreaterThan(Date.now());
    expect(await creditAffiliateOnDelivery(order!)).toBe(false); // second call is a no-op
    expect(await releaseAffiliateCommissions()).toMatchObject({ credited: 0 }); // not due yet
    const later = new Date(Date.now() + 61 * 86_400_000);
    expect(await releaseAffiliateCommissions(later)).toMatchObject({ credited: 1 });
    expect(await releaseAffiliateCommissions(later)).toMatchObject({ credited: 0 }); // idempotent
    expect((await AffiliateCommission.findById(c!._id).lean())!.status).toBe('credited');
    expect(await WalletTransaction.countDocuments({ ref: `affiliate:${order!._id}` })).toBe(1);
    expect(await getBalance(String(affiliate.user._id))).toBe(4_000);
    const mine = await affiliate.agent.get(api('/affiliate/commissions'));
    expect(mine.body.data[0]).toMatchObject({ amount: 4_000, status: 'credited' });
  });

  it('ignores self-referral and unknown codes; cancellation voids the commission', async () => {
    const s = await makeSeller('Aff Store Two');
    await setPlan(s.store._id, 'premium');
    const item = await makeItem(s.store._id, 100_000, 10);
    const buyer = await makeBuyer();
    const own = (await buyer.agent.get(api(`/affiliate/link?productId=${item.productId}`))).body.data.code;
    await buyer.agent.post(api('/cart/items')).send({ productId: item.productId, variantId: item.variantId, qty: 1 });
    await buyer.agent.post(api('/checkout')).send({ addressId: buyer.addressId, paymentMethod: 'cod', idempotencyKey: key(), aff: own });
    let order = await Order.findOne({ storeId: s.store._id }).lean();
    expect(order!.affiliateUserId).toBeUndefined();
    // Flat 15% platform commission for every plan (docs/api-billing.md).
    expect(order!.commission.bps).toBe(1500);

    const aff = await makeBuyer();
    const code = (await aff.agent.get(api(`/affiliate/link?productId=${item.productId}`))).body.data.code;
    const b2 = await makeBuyer();
    await b2.agent.post(api('/cart/items')).send({ productId: item.productId, variantId: item.variantId, qty: 1 });
    await b2.agent.post(api('/checkout')).send({ addressId: b2.addressId, paymentMethod: 'cod', idempotencyKey: key(), aff: code.toLowerCase() });
    order = await Order.findOne({ storeId: s.store._id, buyerId: b2.user._id }).lean();
    expect(String(order!.affiliateUserId)).toBe(String(aff.user._id));
    await transitionOrder(order!._id, 'cancelled', { userId: b2.user._id, kind: 'buyer' }, { reason: 'Changed mind' });
    expect((await AffiliateCommission.findOne({ orderId: order!._id }).lean())!.status).toBe('void');
  });
});
