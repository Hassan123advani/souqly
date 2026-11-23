import { describe, expect, it } from 'vitest';
import { signupAgent, xhr } from '../../test/helpers';
import { Campaign, FlashSale } from '../catalog/marketing.models';
import { Product } from '../catalog/product.model';
import { addStaff, api, makeBuyer, makeItem, makeSeller } from '../orders/orderTestFixtures';
import { User } from '../users/user.model';
import { shareSvg, wrap } from './shareImage';

const DAY = 86_400_000;
const soon = () => new Date(Date.now() - 60_000).toISOString();
const later = (days = 3) => new Date(Date.now() + days * DAY).toISOString();

describe('share image (pure)', () => {
  it('escapes XML and wraps long titles', () => {
    const svg = shareSvg({ kicker: 'Store', title: '<script>alert(1)</script> & "quotes"', price: 125_000 });
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('width="1200" height="630"');
    expect(wrap('a '.repeat(200), 10, 3)).toHaveLength(3);
  });
});

describe('seller marketing API', () => {
  it('vouchers: CRUD with follower-only / min spend / scope; product scope must be own products', async () => {
    const a = await makeSeller('Mkt Vouchers A');
    const b = await makeSeller('Mkt Vouchers B');
    const itemA = await makeItem(a.store._id, 100_000);
    const itemB = await makeItem(b.store._id, 100_000);
    const body = { code: 'fans10', type: 'percent', value: 1000, minSpend: 50_000, startsAt: soon(), endsAt: later(), followerOnly: true, perUserLimit: 1, usageLimit: 100, productIds: [itemA.productId] };
    let res = await a.agent.post(api('/seller/marketing/vouchers')).send(body);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ code: 'FANS10', followerOnly: true, productIds: [itemA.productId] });
    const id = res.body.data.id;
    expect((await a.agent.post(api('/seller/marketing/vouchers')).send(body)).body.error.code).toBe('CODE_TAKEN');
    expect((await a.agent.post(api('/seller/marketing/vouchers')).send({ ...body, code: 'X12', productIds: [itemB.productId] })).body.error.code).toBe('INVALID_PRODUCTS');
    expect((await a.agent.post(api('/seller/marketing/vouchers')).send({ ...body, code: 'X13', value: 9500 })).status).toBe(400);
    res = await a.agent.patch(api(`/seller/marketing/vouchers/${id}`)).send({ minSpend: 80_000, isActive: false });
    expect(res.body.data).toMatchObject({ minSpend: 80_000, isActive: false });

    // Tenant isolation: B cannot see, edit or delete A's voucher.
    expect((await b.agent.get(api('/seller/marketing/vouchers'))).body.data).toEqual([]);
    expect((await b.agent.patch(api(`/seller/marketing/vouchers/${id}`)).send({ minSpend: 1 })).status).toBe(404);
    expect((await b.agent.delete(api(`/seller/marketing/vouchers/${id}`))).status).toBe(404);
    expect((await a.agent.delete(api(`/seller/marketing/vouchers/${id}`))).status).toBe(204);
  });

  it('flash deals: rules enforced, platform flash sale wins, price reflected in the cart', async () => {
    const s = await makeSeller('Mkt Flash');
    const item = await makeItem(s.store._id, 100_000, 10);
    const other = await makeItem(s.store._id, 100_000, 10);
    const ok = { title: 'Weekend deal', startsAt: soon(), endsAt: later(2), items: [{ productId: item.productId, variantId: item.variantId, price: 80_000, quantityLimit: 5 }] };
    expect((await s.agent.post(api('/seller/marketing/flash-deals')).send({ ...ok, endsAt: later(20) })).body.error.code).toBe('DEAL_TOO_LONG');
    expect((await s.agent.post(api('/seller/marketing/flash-deals')).send({ ...ok, items: [{ ...ok.items[0], price: 120_000 }] })).body.error.code).toBe('INVALID_DEAL');
    expect((await s.agent.post(api('/seller/marketing/flash-deals')).send({ ...ok, items: [{ ...ok.items[0], price: 5_000 }] })).body.error.details.items[0].code).toBe('PRICE_TOO_LOW');
    await FlashSale.create({ title: 'Platform', startsAt: new Date(Date.now() - DAY), endsAt: new Date(Date.now() + DAY), items: [{ productId: other.productId, flashPrice: 90_000 }] });
    expect((await s.agent.post(api('/seller/marketing/flash-deals')).send({ ...ok, items: [{ productId: other.productId, price: 70_000 }] })).body.error.details.items[0].code).toBe('IN_PLATFORM_FLASH_SALE');
    expect((await s.agent.post(api('/seller/marketing/flash-deals')).send(ok)).status).toBe(201);

    const buyer = await makeBuyer();
    await buyer.agent.post(api('/cart/items')).send({ productId: item.productId, variantId: item.variantId, qty: 1 });
    const cart = (await buyer.agent.get(api('/cart'))).body.data;
    expect(cart.groups[0].items[0]).toMatchObject({ price: 80_000, flash: true });
    const promos = (await xhr().get(api(`/products/${(await Product.findById(item.productId).lean())!.slug}/promotions`))).body.data;
    expect(promos.flashDeal).toEqual([{ variantId: item.variantId, price: 80_000 }]);
  });

  it('bundles + BXGY: shown on the PDP, applied in the cart only when complete, isolated per store', async () => {
    const s = await makeSeller('Mkt Bundle');
    const other = await makeSeller('Mkt Bundle Other');
    const kurta = await makeItem(s.store._id, 300_000, 10);
    const shawl = await makeItem(s.store._id, 200_000, 10);
    const tee = await makeItem(s.store._id, 100_000, 10);
    const foreign = await makeItem(other.store._id, 100_000, 10);

    expect((await s.agent.post(api('/seller/marketing/bundles')).send({ name: 'Bad', bundlePrice: 600_000, items: [{ productId: kurta.productId, qty: 1 }, { productId: shawl.productId, qty: 1 }] })).body.error.code).toBe('NOT_A_DISCOUNT');
    expect((await s.agent.post(api('/seller/marketing/bundles')).send({ name: 'Cross store', bundlePrice: 1000, items: [{ productId: kurta.productId, qty: 1 }, { productId: foreign.productId, qty: 1 }] })).body.error.code).toBe('INVALID_PRODUCTS');
    let res = await s.agent.post(api('/seller/marketing/bundles')).send({ name: 'Eid set', bundlePrice: 400_000, items: [{ productId: kurta.productId, qty: 1 }, { productId: shawl.productId, qty: 1 }] });
    expect(res.status).toBe(201);
    const bundleId = res.body.data.id;
    res = await s.agent.post(api('/seller/marketing/promotions')).send({ type: 'bxgy', name: 'Tee B1G1', buy: { productIds: [tee.productId], qty: 1 }, get: { productIds: [tee.productId], qty: 1, discountBps: 10_000 }, startsAt: soon(), endsAt: later() });
    expect(res.status).toBe(201);

    const slug = (await Product.findById(kurta.productId).lean())!.slug;
    const pdp = (await xhr().get(api(`/products/${slug}/promotions`))).body.data;
    expect(pdp.bundles[0]).toMatchObject({ id: bundleId, bundlePrice: 400_000, regularPrice: 500_000 });
    expect(pdp.bundles[0].items).toHaveLength(2);

    const buyer = await makeBuyer();
    await buyer.agent.post(api('/cart/items')).send({ productId: kurta.productId, variantId: kurta.variantId, qty: 1 });
    let cart = (await buyer.agent.get(api('/cart'))).body.data;
    expect(cart.groups[0].storeDiscount).toBe(0); // incomplete bundle
    await buyer.agent.post(api('/cart/items')).send({ productId: shawl.productId, variantId: shawl.variantId, qty: 1 });
    await buyer.agent.post(api('/cart/items')).send({ productId: tee.productId, variantId: tee.variantId, qty: 2 });
    cart = (await buyer.agent.get(api('/cart'))).body.data;
    expect(cart.groups[0].storeDiscount).toBe(100_000 + 100_000);
    expect(cart.summary.itemsSubtotal).toBe(700_000);

    // Other store cannot see / edit them.
    expect((await other.agent.get(api('/seller/marketing/bundles'))).body.data).toEqual([]);
    expect((await other.agent.patch(api(`/seller/marketing/bundles/${bundleId}`)).send({ name: 'Hijack', bundlePrice: 1, items: [{ productId: kurta.productId, qty: 1 }, { productId: shawl.productId, qty: 1 }] })).status).toBe(404);
    expect((await other.agent.delete(api(`/seller/marketing/bundles/${bundleId}`))).status).toBe(404);
    expect((await other.agent.get(api('/seller/marketing/promotions'))).body.data).toEqual([]);
  });

  it('campaign nominations (seller) + admin approval; featured products; share images', async () => {
    const s = await makeSeller('Mkt Campaign');
    const other = await makeSeller('Mkt Campaign Other');
    const item = await makeItem(s.store._id, 100_000);
    const c = await Campaign.create({ slug: `eid-${Date.now()}`, name: 'Eid Sale', startsAt: new Date(Date.now() + DAY), endsAt: new Date(Date.now() + 5 * DAY) });
    let res = await s.agent.get(api('/seller/marketing/campaigns'));
    expect(res.body.data.some((x: { id: string }) => x.id === String(c._id))).toBe(true);
    expect((await s.agent.post(api(`/seller/marketing/campaigns/${c._id}/nominations`)).send({ items: [{ productId: item.productId, campaignPrice: 120_000 }] })).body.error.code).toBe('NOT_A_DISCOUNT');
    res = await s.agent.post(api(`/seller/marketing/campaigns/${c._id}/nominations`)).send({ items: [{ productId: item.productId, campaignPrice: 85_000 }] });
    expect(res.body.data).toEqual({ added: 1, skipped: 0 });
    expect((await s.agent.post(api(`/seller/marketing/campaigns/${c._id}/nominations`)).send({ items: [{ productId: item.productId, campaignPrice: 85_000 }] })).body.data.skipped).toBe(1);
    expect((await other.agent.post(api(`/seller/marketing/campaigns/${c._id}/nominations`)).send({ items: [{ productId: item.productId, campaignPrice: 1 }] })).body.error.code).toBe('INVALID_PRODUCTS');
    // The other store never sees this store's nominations.
    const theirs = (await other.agent.get(api('/seller/marketing/campaigns'))).body.data.find((x: { id: string }) => x.id === String(c._id));
    expect(theirs.nominations).toEqual([]);

    const nominationId = (await Campaign.findById(c._id).lean())!.nominations![0]!._id;
    expect((await s.agent.patch(api(`/admin/campaigns/${c._id}/nominations/${nominationId}`)).send({ status: 'approved' })).status).toBe(403);
    const admin = await signupAgent({ name: 'Mkt Admin' });
    await User.updateOne({ email: admin.email }, { $set: { platformRole: 'ADMIN' } });
    res = await admin.agent.patch(api(`/admin/campaigns/${c._id}/nominations/${nominationId}`)).send({ status: 'approved' });
    expect(res.status).toBe(200);
    const after = await Campaign.findById(c._id).lean();
    expect(after!.productIds!.map(String)).toContain(item.productId);
    expect(after!.nominations![0]!.status).toBe('approved');

    // Featured products: own only, then exposed on the public store DTO with the share image.
    expect((await s.agent.put(api('/seller/marketing/featured')).send({ productIds: [(await makeItem(other.store._id, 1000)).productId] })).body.error.code).toBe('INVALID_PRODUCTS');
    res = await s.agent.put(api('/seller/marketing/featured')).send({ productIds: [item.productId] });
    expect(res.body.data.productIds).toEqual([item.productId]);
    const pub = (await xhr().get(api(`/stores/${s.store.slug}`))).body.data;
    expect(pub).toMatchObject({ featuredProductIds: [item.productId], shareImage: `/api/v1/stores/${s.store.slug}/share-image.svg` });
    res = await xhr().get(api(`/stores/${s.store.slug}/share-image.svg`));
    expect(res.headers['content-type']).toMatch(/image\/svg\+xml/);
    expect(String(res.body)).toContain('Mkt Campaign');
    const pslug = (await Product.findById(item.productId).lean())!.slug;
    expect((await xhr().get(api(`/products/${pslug}/share-image.png`))).status).toBe(302);
    expect((await xhr().get(api(`/products/${pslug}/share-image.svg`))).headers['content-type']).toMatch(/svg/);
  });

  it('requires store.marketing.manage', async () => {
    const s = await makeSeller('Mkt Perms');
    const cashier = await addStaff(s.store._id, 'CASHIER');
    expect((await cashier.agent.get(api('/seller/marketing/vouchers'))).status).toBe(403);
    const marketing = await addStaff(s.store._id, 'MARKETING');
    expect((await marketing.agent.get(api('/seller/marketing/vouchers'))).status).toBe(200);
  });
});
