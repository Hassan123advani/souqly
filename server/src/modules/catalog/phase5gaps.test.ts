import { beforeAll, describe, expect, it } from 'vitest';
import { makeBrand, makeCategoryTree, makeProduct, makeStore } from '../../test/catalogFixtures';
import { api, signupAgent, xhr } from '../../test/helpers';
import { invalidateStoreIndex } from './catalog.service';
import { Product } from './product.model';

/** Phase-4 gaps fixed in Phase 5: store city, defaultVariantId, facets excluding own filter, delete one history entry. */
let catSlug = '';
let slugMulti = '';
let cheapVariant = '';
let storeSlug = '';

beforeAll(async () => {
  const { sub } = await makeCategoryTree();
  catSlug = sub.slug;
  const store = await makeStore({ address: { city: 'Multan' } });
  storeSlug = store.slug;
  invalidateStoreIndex();
  const [acme, zed] = await Promise.all([makeBrand('Acme Gap'), makeBrand('Zed Gap')]);
  await makeProduct({ storeId: store._id, category: sub, title: 'Gap Shirt Red', price: 1000, color: 'Red', brand: acme });
  await makeProduct({ storeId: store._id, category: sub, title: 'Gap Shirt Blue', price: 2000, color: 'Blue', brand: zed });
  const multi = await makeProduct({ storeId: store._id, category: sub, title: 'Gap Multi', price: 5000 });
  // Cheapest variant is out of stock → default is the cheapest IN-STOCK one.
  multi.variants.push({ sku: 'GM-2', options: {}, price: 100, stock: 0 } as never, { sku: 'GM-3', options: {}, price: 300, stock: 2 } as never);
  multi.recomputeDerived();
  await multi.save();
  slugMulti = multi.slug;
  cheapVariant = String((await Product.findById(multi._id).lean())!.variants.find((v) => v.sku === 'GM-3')!._id);
});

describe('phase 4 gaps', () => {
  it('product detail store summary and /stores/:slug include the city', async () => {
    const d = await xhr().get(api(`/products/${slugMulti}`));
    expect(d.body.data.store.city).toBe('Multan');
    expect((await xhr().get(api(`/stores/${storeSlug}`))).body.data.city).toBe('Multan');
  });

  it('product cards carry defaultVariantId', async () => {
    const res = await xhr().get(api(`/products?category=${catSlug}&limit=50`));
    const card = res.body.data.find((c: { slug: string }) => c.slug === slugMulti);
    expect(card.defaultVariantId).toBe(cheapVariant);
    for (const c of res.body.data) expect(c.defaultVariantId).toMatch(/^[a-f0-9]{24}$/);
  });

  it('facets exclude their own filter (multi-select)', async () => {
    const res = await xhr().get(api(`/products?category=${catSlug}&brand=acme-gap&color=Red&facets=1`));
    const f = res.body.meta.facets;
    expect(res.body.data).toHaveLength(1);
    // Brand facet ignores brand=acme-gap but keeps color=Red → only Acme.
    expect(f.brands.map((b: { slug: string }) => b.slug)).toEqual(['acme-gap']);
    // Color facet ignores color=Red but keeps brand=acme-gap → only Red.
    expect(f.colors.map((c: { value: string }) => c.value)).toEqual(['Red']);
    const onlyColor = await xhr().get(api(`/products?category=${catSlug}&color=Red&facets=1`));
    expect(onlyColor.body.meta.facets.colors.map((c: { value: string }) => c.value).sort()).toEqual(['Blue', 'Red']);
    const onlyBrand = await xhr().get(api(`/products?category=${catSlug}&brand=acme-gap&facets=1`));
    expect(onlyBrand.body.meta.facets.brands.map((b: { slug: string }) => b.slug).sort()).toEqual(['acme-gap', 'zed-gap']);
  });

  it('DELETE /search/history/:q removes one entry', async () => {
    const { agent } = await signupAgent();
    await agent.get(api('/products?q=gap shirt'));
    await agent.get(api('/products?q=gap multi'));
    await new Promise((r) => setTimeout(r, 80));
    expect((await agent.get(api('/search/history'))).body.data.sort()).toEqual(['gap multi', 'gap shirt']);
    expect((await agent.delete(api(`/search/history/${encodeURIComponent('Gap Shirt')}`))).status).toBe(204);
    expect((await agent.get(api('/search/history'))).body.data).toEqual(['gap multi']);
    expect((await xhr().delete(api('/search/history/x'))).status).toBe(401);
  });
});
