import { beforeAll, describe, expect, it } from 'vitest';
import { checkProductAlerts, sweepAlerts } from '../alerts/alert.service';
import { ProductAlert } from '../alerts/alert.model';
import { Product } from '../catalog/product.model';
import { notifyCapture } from '../chat/notifyAdapter';
import { api, makeBuyer, makeItem, makeSeller } from '../orders/orderTestFixtures';
import { Store } from '../stores/store.model';
import { Voucher } from '../vouchers/voucher.model';
import { isFollowing } from './follow.service';

let buyer: Awaited<ReturnType<typeof makeBuyer>>;
let buyer2: Awaited<ReturnType<typeof makeBuyer>>;
let seller: Awaited<ReturnType<typeof makeSeller>>;
let item: Awaited<ReturnType<typeof makeItem>>;

beforeAll(async () => {
  buyer = await makeBuyer();
  buyer2 = await makeBuyer();
  seller = await makeSeller('Follow Store');
  item = await makeItem(seller.store._id, 200_000, 10);
});

describe('follows', () => {
  it('follow / unfollow is idempotent and keeps followerCount', async () => {
    const slug = seller.store.slug;
    expect((await buyer.agent.post(api(`/stores/${slug}/follow`))).body.data).toMatchObject({ following: true, followerCount: 1 });
    expect((await buyer.agent.post(api(`/stores/${slug}/follow`))).body.data.followerCount).toBe(1);
    expect((await buyer.agent.get(api(`/stores/${slug}/follow-status`))).body.data).toEqual({ following: true, followerCount: 1 });
    expect(await isFollowing(String(buyer.user._id), seller.store._id)).toBe(true);

    const following = await buyer.agent.get(api('/me/following'));
    expect(following.body.data[0]).toMatchObject({ slug, followerCount: 1 });
    const feed = await buyer.agent.get(api('/feed/following'));
    expect(feed.body.data.map((p: { id: string }) => p.id)).toContain(item.productId);
    expect((await buyer2.agent.get(api('/feed/following'))).body.data).toHaveLength(0);

    expect((await buyer.agent.delete(api(`/stores/${slug}/follow`))).body.data).toMatchObject({ following: false, followerCount: 0 });
    expect((await buyer.agent.delete(api(`/stores/${slug}/follow`))).body.data.followerCount).toBe(0);
    expect((await Store.findById(seller.store._id).lean())!.followerCount).toBe(0);
  });

  it('follower-only vouchers need a follow', async () => {
    const day = 86_400_000;
    await Voucher.create({ code: 'FANS10', scope: 'store', storeId: seller.store._id, type: 'percent', value: 1000, minSpend: 0, startsAt: new Date(Date.now() - day), endsAt: new Date(Date.now() + day), followerOnly: true });
    await buyer2.agent.post(api('/cart/items')).send({ productId: item.productId, variantId: item.variantId, qty: 1 });
    const denied = await buyer2.agent.post(api('/cart/vouchers')).send({ code: 'FANS10' });
    expect(denied.status).toBe(400);
    expect(denied.body.error.code).toBe('VOUCHER_NOT_ELIGIBLE');
    await buyer2.agent.post(api(`/stores/${seller.store.slug}/follow`));
    const ok = await buyer2.agent.post(api('/cart/vouchers')).send({ code: 'FANS10' });
    expect(ok.status, JSON.stringify(ok.body)).toBeLessThan(300);
  });
});

describe('wishlists', () => {
  it('default list, add/remove, contains, wishlistCount and per-user isolation', async () => {
    const lists = await buyer.agent.get(api('/wishlists'));
    expect(lists.body.data).toHaveLength(1);
    expect(lists.body.data[0]).toMatchObject({ name: 'My wishlist', isDefault: true });
    const defId = lists.body.data[0].id;

    expect((await buyer.agent.post(api('/wishlists/items')).send({ productId: item.productId })).status).toBe(201);
    const gifts = await buyer.agent.post(api('/wishlists')).send({ name: 'Gifts' });
    expect(gifts.status).toBe(201);
    await buyer.agent.post(api(`/wishlists/${gifts.body.data.id}/items`)).send({ productId: item.productId, variantId: item.variantId });
    // Same user in two lists counts once.
    expect((await Product.findById(item.productId).lean())!.wishlistCount).toBe(1);

    const contains = await buyer.agent.get(api(`/wishlists/contains?productIds=${item.productId},${'a'.repeat(24)}`));
    expect(contains.body.data).toEqual({ [item.productId]: true, ['a'.repeat(24)]: false });

    // Another user cannot read, rename, add to or delete my list.
    expect((await buyer2.agent.get(api(`/wishlists/${gifts.body.data.id}`))).status).toBe(404);
    expect((await buyer2.agent.patch(api(`/wishlists/${gifts.body.data.id}`)).send({ name: 'Mine' })).status).toBe(404);
    expect((await buyer2.agent.post(api(`/wishlists/${gifts.body.data.id}/items`)).send({ productId: item.productId })).status).toBe(404);
    expect((await buyer2.agent.delete(api(`/wishlists/${gifts.body.data.id}`))).status).toBe(404);
    expect((await buyer2.agent.get(api(`/wishlists/contains?productIds=${item.productId}`))).body.data[item.productId]).toBe(false);

    const detail = await buyer.agent.get(api(`/wishlists/${defId}`));
    expect(detail.body.data.items[0].product).toMatchObject({ slug: item.product.slug, inStock: true });

    expect((await buyer.agent.delete(api(`/wishlists/${defId}`))).status).toBe(400);
    expect((await buyer.agent.delete(api(`/wishlists/${defId}/items/${item.productId}`))).status).toBe(204);
    expect((await Product.findById(item.productId).lean())!.wishlistCount).toBe(1);
    expect((await buyer.agent.delete(api(`/wishlists/${gifts.body.data.id}`))).status).toBe(204);
    expect((await Product.findById(item.productId).lean())!.wishlistCount).toBe(0);
  });
});

describe('alerts', () => {
  it('notifies on price drop (re-armed) and back in stock (once)', async () => {
    const r = await buyer.agent.post(api('/alerts')).send({ productId: item.productId, variantId: item.variantId, type: 'price_drop' });
    expect(r.status).toBe(201);
    expect(r.body.data.targetPrice).toBe(200_000);
    expect(await checkProductAlerts(item.productId)).toBe(0);

    const p = await Product.findById(item.productId);
    p!.variants[0]!.price = 180_000;
    await p!.save();
    const before = notifyCapture.length;
    expect(await checkProductAlerts(item.productId)).toBe(1);
    expect(notifyCapture.slice(before)[0]).toMatchObject({ type: 'alert.price_drop' });
    expect(await checkProductAlerts(item.productId)).toBe(0);

    // Back in stock: subscribe only while out of stock.
    expect((await buyer.agent.post(api('/alerts')).send({ productId: item.productId, type: 'back_in_stock' })).status).toBe(400);
    p!.variants[0]!.stock = 0;
    await p!.save();
    expect((await buyer2.agent.post(api('/alerts')).send({ productId: item.productId, type: 'back_in_stock' })).status).toBe(201);
    expect(await sweepAlerts()).toBe(0);
    p!.variants[0]!.stock = 5;
    await p!.save();
    expect(await sweepAlerts()).toBe(1);
    expect(await sweepAlerts()).toBe(0);
    expect((await ProductAlert.findOne({ type: 'back_in_stock' }).lean())!.active).toBe(false);
  });
});

describe('reports', () => {
  it('reports a product once; unknown targets 404', async () => {
    const r = await buyer.agent.post(api('/reports')).send({ targetType: 'product', targetId: item.productId, reason: 'counterfeit', details: '<b>fake</b>' });
    expect(r.status).toBe(201);
    expect((await buyer.agent.post(api('/reports')).send({ targetType: 'product', targetId: item.productId, reason: 'counterfeit' })).status).toBe(409);
    expect((await buyer.agent.post(api('/reports')).send({ targetType: 'store', targetId: 'b'.repeat(24), reason: 'spam' })).status).toBe(404);
    expect((await buyer.agent.post(api('/reports')).send({ targetType: 'user', targetId: item.productId, reason: 'spam' })).status).toBe(400);
  });
});
