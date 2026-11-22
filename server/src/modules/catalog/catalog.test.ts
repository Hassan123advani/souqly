import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../app';
import { makeBrand, makeCategoryTree, makeProduct, makeStore } from '../../test/catalogFixtures';
import { api, signupAgent } from '../../test/helpers';
import type { StoreDoc } from '../stores/store.model';
import { Campaign, FlashSale, HomeContent } from './marketing.models';
import { Product } from './product.model';

let tree: Awaited<ReturnType<typeof makeCategoryTree>>;
let storeA: StoreDoc;
let storeB: StoreDoc;
let storePending: StoreDoc;
let storeHoliday: StoreDoc;
const slugs: Record<string, string> = {};

beforeAll(async () => {
  tree = await makeCategoryTree();
  storeA = await makeStore({ isMall: true, address: { city: 'Lahore' } });
  storeB = await makeStore({ address: { city: 'Karachi' } });
  storePending = await makeStore({ status: 'pending' });
  storeHoliday = await makeStore({ holidayMode: { enabled: true, message: 'Back soon' } });
  const mehrab = await makeBrand('Mehrab Test');
  const { sub, other } = tree;
  const P = async (key: string, o: Parameters<typeof makeProduct>[0]) => {
    slugs[key] = (await makeProduct(o)).slug;
  };
  await P('oxford', { storeId: storeA._id, category: sub, title: 'Oxford Cotton Shirt', price: 250_000, compareAt: 350_000, soldCount: 500, ratingAvg: 4.5, color: 'Navy', brand: mehrab, freeShipping: true });
  await P('linen', { storeId: storeA._id, category: sub, title: 'Linen Summer Shirt', price: 320_000, soldCount: 120, ratingAvg: 4.8, color: 'White' });
  await P('denim', { storeId: storeA._id, category: sub, title: 'Denim Work Shirt', price: 180_000, soldCount: 900, ratingAvg: 3.9, stock: 3, color: 'Navy' });
  await P('pot', { storeId: storeA._id, category: other, title: 'Clay Cooking Pot', price: 400_000, soldCount: 50, ratingAvg: 4.0 });
  await P('draft', { storeId: storeA._id, category: sub, title: 'Draft Secret Shirt', price: 100_000, status: 'draft' });
  await P('polo', { storeId: storeB._id, category: sub, title: 'Polo Shirt Classic', price: 150_000, soldCount: 300, ratingAvg: 4.1, color: 'Black' });
  await P('flannel', { storeId: storeB._id, category: sub, title: 'Flannel Check Shirt', price: 210_000, compareAt: 260_000, soldCount: 300, ratingAvg: 4.1, color: 'Black' });
  await P('karahi', { storeId: storeB._id, category: other, title: 'Steel Karahi', price: 220_000, soldCount: 10, ratingAvg: 4.6 });
  await P('pendingStore', { storeId: storePending._id, category: sub, title: 'Pending Store Shirt', price: 100_000 });
  await P('holiday', { storeId: storeHoliday._id, category: sub, title: 'Holiday Kurta Shirt', price: 199_000, soldCount: 5 });
});

const list = (qs: string) => request(app).get(api(`/products?${qs}`));
const titles = (res: request.Response) => (res.body.data as { title: string }[]).map((p) => p.title);

describe('GET /products filters', () => {
  it('only lists published products of approved stores', async () => {
    const res = await list('limit=60');
    expect(res.status).toBe(200);
    const t = titles(res);
    expect(t).toHaveLength(8);
    expect(t).not.toContain('Draft Secret Shirt');
    expect(t).not.toContain('Pending Store Shirt');
    expect(res.body.meta.total).toBe(8);
  });

  it('category includes the subtree', async () => {
    const res = await list(`category=${tree.top.slug}&limit=60`);
    expect(titles(res).sort()).toEqual(['Denim Work Shirt', 'Flannel Check Shirt', 'Holiday Kurta Shirt', 'Linen Summer Shirt', 'Oxford Cotton Shirt', 'Polo Shirt Classic']);
    expect((await list('category=does-not-exist')).body.data).toEqual([]);
  });

  it('brand, price, rating, discount, freeShipping, inStock, color, store, mall and city', async () => {
    expect(titles(await list('brand=mehrab-test'))).toEqual(['Oxford Cotton Shirt']);
    expect(titles(await list('priceMin=200000&priceMax=250000&sort=price_asc'))).toEqual(['Flannel Check Shirt', 'Steel Karahi', 'Oxford Cotton Shirt']);
    expect(titles(await list('rating=4.6&sort=top_rated'))).toEqual(['Linen Summer Shirt', 'Steel Karahi']);
    expect(titles(await list('discount=25'))).toEqual(['Oxford Cotton Shirt']);
    expect(titles(await list('freeShipping=1'))).toEqual(['Oxford Cotton Shirt']);
    expect(titles(await list('color=Black&sort=price_asc'))).toEqual(['Polo Shirt Classic', 'Flannel Check Shirt']);
    expect(titles(await list(`store=${storeB.slug}&sort=price_asc`))).toEqual(['Polo Shirt Classic', 'Flannel Check Shirt', 'Steel Karahi']);
    expect(titles(await list('mall=1&sort=price_asc'))).toEqual(['Denim Work Shirt', 'Oxford Cotton Shirt', 'Linen Summer Shirt', 'Clay Cooking Pot']);
    expect(titles(await list('city=karachi&sort=price_asc'))).toHaveLength(3);
    await Product.updateOne({ slug: slugs.linen }, { $set: { totalStock: 0 } });
    expect(titles(await list('inStock=1&limit=60'))).not.toContain('Linen Summer Shirt');
    await Product.updateOne({ slug: slugs.linen }, { $set: { totalStock: 20 } });
  });

  it('rejects invalid query values', async () => {
    expect((await list('sort=cheapest')).status).toBe(400);
    expect((await list('attrs[$where]=1')).status).toBe(400);
    expect((await list('cursor=garbage')).status).toBe(400);
  });

  it('returns card fields (stockLeft only when < 10, unavailable for holiday stores)', async () => {
    const res = await list('limit=60');
    const denim = res.body.data.find((c: { slug: string }) => c.slug === slugs.denim);
    expect(denim).toMatchObject({ price: 180_000, stockLeft: 3, isMall: true, store: { slug: storeA.slug } });
    const oxford = res.body.data.find((c: { slug: string }) => c.slug === slugs.oxford);
    expect(oxford).toMatchObject({ compareAtPrice: 350_000, discountPct: 29 });
    expect(oxford.stockLeft).toBeUndefined();
    expect(res.body.data.find((c: { slug: string }) => c.slug === slugs.holiday).unavailable).toBe(true);
  });

  it('returns facets on request', async () => {
    const res = await list(`category=${tree.top.slug}&facets=1`);
    expect(res.body.meta.facets.brands).toEqual([{ slug: 'mehrab-test', name: 'Mehrab Test', count: 1 }]);
    expect(res.body.meta.facets.priceRange).toEqual({ min: 150_000, max: 320_000 });
    expect(res.body.meta.facets.colors).toEqual(expect.arrayContaining([{ value: 'Navy', count: 2 }, { value: 'Black', count: 2 }]));
  });
});

describe('GET /products sorts + cursor pagination', () => {
  const sorts = ['relevance', 'newest', 'price_asc', 'price_desc', 'best_selling', 'top_rated', 'discount'];

  it.each(sorts)('paginates %s with a cursor without gaps or duplicates', async (sort) => {
    const full = (await list(`sort=${sort}&limit=60`)).body.data.map((c: { id: string }) => c.id);
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page++) {
      const res: request.Response = await list(`sort=${sort}&limit=3${cursor ? `&cursor=${cursor}` : ''}`);
      expect(res.status).toBe(200);
      if (page === 0) expect(res.body.meta.total).toBe(8);
      else expect(res.body.meta.total).toBeUndefined();
      seen.push(...res.body.data.map((c: { id: string }) => c.id));
      cursor = res.body.meta.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toEqual(full);
    expect(new Set(seen).size).toBe(8);
  });

  it('orders correctly', async () => {
    const prices = (await list('sort=price_desc')).body.data.map((c: { price: number }) => c.price);
    expect(prices).toEqual([...prices].sort((a, b) => b - a));
    const sold = (await list('sort=best_selling')).body.data.map((c: { soldCount: number }) => c.soldCount);
    expect(sold).toEqual([...sold].sort((a, b) => b - a));
    expect(titles(await list('sort=discount&limit=2'))).toEqual(['Oxford Cotton Shirt', 'Flannel Check Shirt']);
  });
});

describe('search (D-008)', () => {
  it('uses the text index for exact words', async () => {
    const res = await list('q=oxford');
    expect(titles(res)).toEqual(['Oxford Cotton Shirt']);
    expect(res.body.meta.didYouMean).toBeUndefined();
  });

  it('falls back to a fuzzy regex for typos with a missing letter', async () => {
    const res = await list('q=shrt&limit=60');
    expect(titles(res)).toEqual(expect.arrayContaining(['Oxford Cotton Shirt', 'Polo Shirt Classic']));
    expect(titles(res)).not.toContain('Draft Secret Shirt');
  });

  it('suggests a correction (Levenshtein) when nothing matches', async () => {
    const res = await list('q=oxfrod');
    expect(res.body.meta.didYouMean).toBe('oxford');
    expect(titles(res)).toEqual(['Oxford Cotton Shirt']);
    const none = await list('q=zzzzqqq');
    expect(none.body.data).toEqual([]);
    expect(none.body.meta.didYouMean).toBeUndefined();
  });

  it('suggest endpoint returns products, stores and categories', async () => {
    const res = await request(app).get(api('/search/suggest?q=shrt'));
    expect(res.status).toBe(200);
    expect(res.body.data.products.length).toBeGreaterThan(0);
    expect(res.body.data.didYouMean).toBe('shirt');
    const cat = await request(app).get(api('/search/suggest?q=shirts'));
    expect(cat.body.data.categories.map((c: { slug: string }) => c.slug)).toContain(tree.sub.slug);
    expect((await request(app).get(api('/search/suggest'))).status).toBe(400);
  });

  it('trending falls back to a curated list; history needs auth', async () => {
    const res = await request(app).get(api('/search/trending'));
    expect(res.body.data.length).toBeGreaterThan(0);
    expect((await request(app).get(api('/search/history'))).status).toBe(401);
  });

  it('records history for logged-in users and clears it', async () => {
    const { agent } = await signupAgent();
    await agent.get(api('/products?q=linen'));
    await new Promise((r) => setTimeout(r, 50));
    expect((await agent.get(api('/search/history'))).body.data).toEqual(['linen']);
    expect((await agent.delete(api('/search/history'))).status).toBe(204);
    expect((await agent.get(api('/search/history'))).body.data).toEqual([]);
  });
});

describe('product detail', () => {
  it('returns the product with store card and breadcrumbs, hides unpublished', async () => {
    const res = await request(app).get(api(`/products/${slugs.oxford}`));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ title: 'Oxford Cotton Shirt', store: { slug: storeA.slug, isMall: true } });
    expect(res.body.data.breadcrumbs.map((b: { slug: string }) => b.slug)).toEqual([tree.top.slug, tree.sub.slug]);
    expect(JSON.stringify(res.body)).not.toMatch(/searchText|owner-secret|PK00SECRET|ownerId/);
    expect((await request(app).get(api(`/products/${slugs.draft}`))).status).toBe(404);
    expect((await request(app).get(api(`/products/${slugs.pendingStore}`))).status).toBe(404);
    const holiday = await request(app).get(api(`/products/${slugs.holiday}`));
    expect(holiday.body.data).toMatchObject({ unavailable: true, holidayMessage: 'Back soon' });
  });

  it('counts views once per viewer and records recently viewed', async () => {
    const { agent } = await signupAgent();
    const before = (await Product.findOne({ slug: slugs.linen }).lean())!.viewCount;
    await agent.get(api(`/products/${slugs.linen}`));
    await agent.get(api(`/products/${slugs.linen}`));
    await new Promise((r) => setTimeout(r, 50));
    expect((await Product.findOne({ slug: slugs.linen }).lean())!.viewCount).toBe(before + 1);
    const rv = await agent.get(api('/recently-viewed'));
    expect(rv.body.data.map((c: { slug: string }) => c.slug)).toEqual([slugs.linen]);
  });

  it('related, more-from-store, bought-together', async () => {
    const related = await request(app).get(api(`/products/${slugs.oxford}/related`));
    expect(related.body.data.map((c: { slug: string }) => c.slug)).not.toContain(slugs.oxford);
    expect(related.body.data.length).toBeGreaterThan(0);
    const more = await request(app).get(api(`/products/${slugs.oxford}/more-from-store`));
    expect(more.body.data.every((c: { store: { slug: string } }) => c.store.slug === storeA.slug)).toBe(true);
    const bt = await request(app).get(api(`/products/${slugs.oxford}/bought-together`));
    expect(bt.body.data.length).toBeGreaterThan(0);
    const jfy = await request(app).get(api('/products/feed/just-for-you?limit=4'));
    expect(jfy.body.data).toHaveLength(4);
    expect(jfy.body.meta.nextCursor).toBeTruthy();
  });
});

describe('categories, brands', () => {
  it('returns the tree and a category with breadcrumbs, children and filters', async () => {
    const tree1 = await request(app).get(api('/catalog/categories'));
    const top = tree1.body.data.find((c: { slug: string }) => c.slug === tree.top.slug);
    expect(top.children.map((c: { slug: string }) => c.slug)).toEqual([tree.sub.slug]);
    const sub = await request(app).get(api(`/catalog/categories/${tree.sub.slug}`));
    expect(sub.body.data.breadcrumbs).toHaveLength(2);
    expect(sub.body.data.filters.attributes.map((a: { key: string }) => a.key)).toEqual(['color']);
    expect((await request(app).get(api('/catalog/categories/nope'))).status).toBe(404);
    expect((await request(app).get(api('/catalog/brands/mehrab-test'))).body.data.name).toBe('Mehrab Test');
  });
});

describe('public stores never leak private fields', () => {
  it('GET /stores/:slug', async () => {
    const res = await request(app).get(api(`/stores/${storeA.slug}`));
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    for (const secret of ['business', 'payout', 'ownerId', 'Secret Pvt', 'PK00SECRET', 'owner-secret@example.com', 'healthScore', '"plan"']) {
      expect(body).not.toContain(secret);
    }
    expect(res.body.data).toMatchObject({ slug: storeA.slug, isMall: true, contact: { whatsapp: '+923001112223' } });
    expect((await request(app).get(api(`/stores/${storePending.slug}`))).status).toBe(404);
  });

  it('lists stores and their products / categories', async () => {
    const all = await request(app).get(api('/stores?sort=new'));
    expect(JSON.stringify(all.body)).not.toMatch(/business|payout|ownerId|owner-secret/);
    expect(all.body.data.map((s: { slug: string }) => s.slug)).not.toContain(storePending.slug);
    expect((await request(app).get(api('/stores?mall=1'))).body.data.map((s: { slug: string }) => s.slug)).toEqual([storeA.slug]);
    const prods = await request(app).get(api(`/stores/${storeB.slug}/products?store=${storeA.slug}`));
    expect(prods.body.data).toHaveLength(3); // the `store` query param cannot escape the scope
    const cats = await request(app).get(api(`/stores/${storeA.slug}/categories`));
    expect(cats.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ slug: tree.sub.slug, count: 3 })]));
  });
});

describe('home, flash sale, campaigns', () => {
  it('builds the home payload in one round trip', async () => {
    const oxford = await Product.findOne({ slug: slugs.oxford });
    await FlashSale.create({ title: 'Flash', startsAt: new Date(Date.now() - 1000), endsAt: new Date(Date.now() + 3600_000), items: [{ productId: oxford!._id, flashPrice: 199_900, quantityLimit: 10 }] });
    await HomeContent.create({ key: 'home', heroSlides: [{ image: '/x.svg', title: 'Every shop, one souq' }], sections: [{ type: 'best_sellers', title: 'Best', enabled: true, order: 0 }, { type: 'top_stores', title: 'Stores', enabled: true, order: 1 }] });
    await Campaign.create({ slug: 'eid-test', name: 'Eid', startsAt: new Date(Date.now() - 1000), endsAt: new Date(Date.now() + 3600_000), categoryIds: [tree.top._id] });

    const res = await request(app).get(api('/home'));
    expect(res.status).toBe(200);
    expect(res.body.data.heroSlides[0].title).toBe('Every shop, one souq');
    expect(res.body.data.flashSale.items[0]).toMatchObject({ slug: slugs.oxford, flash: { price: 199_900 } });
    expect(res.body.data.sections.map((s: { type: string }) => s.type)).toEqual(['best_sellers', 'top_stores']);
    expect(JSON.stringify(res.body)).not.toMatch(/owner-secret|PK00SECRET/);

    const flash = await request(app).get(api('/flash-sales/current'));
    expect(flash.body.data.items[0]).toMatchObject({ flashPrice: 199_900, quantityLimit: 10 });
    const camp = await request(app).get(api('/campaigns/eid-test'));
    expect(camp.body.data.isLive).toBe(true);
    expect(camp.body.data.products.length).toBe(6);
  });
});
