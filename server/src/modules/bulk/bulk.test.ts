import { describe, expect, it } from 'vitest';
import { setPlan } from '../../test/growthFixtures';
import { Product } from '../catalog/product.model';
import { api, categories, makeItem, makeSeller } from '../orders/orderTestFixtures';
import { parseRupees } from './productCsv.service';

const HEAD = 'product_title,sku,price,compare_at_price,stock,barcode,category_id,description,option1_name,option1_value,option2_name,option2_value,weight_grams\n';
type Agent = Awaited<ReturnType<typeof makeSeller>>['agent'];
const upload = (agent: Agent, csv: string, dryRun = false) =>
  agent
    .post(api(`/seller/products/import${dryRun ? '?dryRun=1' : ''}`))
    .attach('file', Buffer.from(csv, 'utf8'), { filename: 'products.csv', contentType: 'text/csv' });

describe('parseRupees', () => {
  it('converts rupees to paisa strictly', () => {
    expect(parseRupees('1250')).toBe(125_000);
    expect(parseRupees('1250.5')).toBe(125_050);
    expect(parseRupees('0.05')).toBe(5);
    expect(parseRupees('1,250')).toBeNull();
    expect(parseRupees('-1')).toBeNull();
    expect(parseRupees('1.234')).toBeNull();
  });
});

describe('CSV bulk upload / edit', () => {
  it('Free plan cannot import (PLAN_LIMIT) but can export and get the template', async () => {
    const s = await makeSeller('CSV Free');
    expect((await s.agent.get(api('/seller/products/import-template.csv'))).text).toContain('product_title,sku,price');
    const res = await upload(s.agent, HEAD + 'X,SKU1,100,,1,,,,,,,,\n', true);
    expect(res.status).toBe(403);
    expect(res.body.error!.code).toBe('PLAN_LIMIT');
  });

  it('dry run reports per-row errors and writes nothing; real import creates drafts and upserts by sku', async () => {
    const s = await makeSeller('CSV Pro');
    await setPlan(s.store._id, 'pro');
    const { sub } = await categories();
    const existing = await makeItem(s.store._id, 100_000, 5);
    const existingSku = (await Product.findById(existing.productId).lean())!.variants[0]!.sku;
    const cat = String(sub._id);

    const bad =
      HEAD +
      `Lawn Suit,LAWN-R-S,3500,4500,10,,${cat},"Soft, breathable lawn",Color,Red,Size,S,450\n` +
      `Lawn Suit,LAWN-R-S,3500,,10,,${cat},,Color,Red,Size,M,\n` + // duplicate sku
      `Bad Price,BAD-1,abc,,1,,${cat},,,,,,\n` +
      `No Category,NOCAT-1,100,,1,,,,,,,,\n`;
    let res = await upload(s.agent, bad, true);
    expect(res.status).toBe(200);
    const codes = (res.body.data.errors as { row: number; code: string }[]).map((e) => `${e.row}:${e.code}`).sort();
    expect(codes).toEqual(['3:DUPLICATE_SKU', '4:INVALID_PRICE', '5:INVALID_CATEGORY']);
    expect(await Product.countDocuments({ storeId: s.store._id })).toBe(1);

    const good =
      HEAD +
      `Lawn Suit,LAWN-R-S,3500,4500,10,8964000000001,${cat},"Soft, breathable lawn ""3pc""",Color,Red,Size,S,450\n` +
      `Lawn Suit,LAWN-R-M,3600,,6,,${cat},,Color,Red,Size,M,\n` +
      `"Shawl, Wool",SHAWL-1,2000.50,,3,,${cat},"Line one\nline two",,,,,\n` +
      `ignored title,${existingSku},1500,2000,12,,,,,,,,\n`;
    res = await upload(s.agent, good, true);
    expect(res.body.data).toMatchObject({ dryRun: true, rows: 4, created: 3, updated: 1, productsCreated: 2, errors: [] });
    expect(await Product.countDocuments({ storeId: s.store._id })).toBe(1);

    res = await upload(s.agent, good);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ dryRun: false, created: 3, updated: 1, productsCreated: 2 });
    const lawn = await Product.findOne({ storeId: s.store._id, title: 'Lawn Suit' }).lean();
    expect(lawn).toMatchObject({ status: 'draft' });
    expect(lawn!.variants.map((v) => [v.sku, v.price, v.stock, v.options])).toEqual([
      ['LAWN-R-S', 350_000, 10, { color: 'Red', size: 'S' }],
      ['LAWN-R-M', 360_000, 6, { color: 'Red', size: 'M' }],
    ]);
    const shawl = await Product.findOne({ storeId: s.store._id, title: 'Shawl, Wool' }).lean();
    expect(shawl!.variants[0]!.price).toBe(200_050);
    const updated = (await Product.findById(existing.productId).lean())!.variants[0]!;
    expect(updated).toMatchObject({ price: 150_000, compareAtPrice: 200_000, stock: 12 });

    // Re-import is an update (upsert by sku), not a duplicate.
    res = await upload(s.agent, good);
    expect(res.body.data).toMatchObject({ created: 0, updated: 4 });
    expect(await Product.countDocuments({ storeId: s.store._id })).toBe(3);
  });

  it('export is one row per variant and CSV-injection safe', async () => {
    const s = await makeSeller('CSV Export');
    await makeItem(s.store._id, 100_000, 2, { title: '=HYPERLINK("http://evil")' } as never);
    const res = await s.agent.get(api('/seller/products/export.csv'));
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(res.text.split('\r\n').filter(Boolean)).toHaveLength(2);
  });

  it('rejects non-CSV uploads, oversize files and enforces tenant isolation on sku upsert', async () => {
    const a = await makeSeller('CSV Tenant A');
    const b = await makeSeller('CSV Tenant B');
    await setPlan(b.store._id, 'pro');
    const itemA = await makeItem(a.store._id, 100_000, 5);
    const skuA = (await Product.findById(itemA.productId).lean())!.variants[0]!.sku;
    const { sub } = await categories();
    // Same sku in B's file creates B's own product; A's variant is untouched.
    const res = await upload(b.agent, HEAD + `Copy,${skuA},1,,99,,${String(sub._id)},,,,,,\n`);
    expect(res.body.data).toMatchObject({ created: 1, updated: 0 });
    expect((await Product.findById(itemA.productId).lean())!.variants[0]).toMatchObject({ price: 100_000, stock: 5 });
    expect((await b.agent.get(api('/seller/products/export.csv'))).text).not.toContain(String(itemA.productId));

    const exe = await b.agent.post(api('/seller/products/import')).attach('file', Buffer.from('MZ'), { filename: 'evil.exe', contentType: 'application/x-msdownload' });
    expect(exe.status).toBe(400);
    const big = await upload(b.agent, HEAD + 'x'.repeat(2 * 1024 * 1024 + 10));
    expect(big.body.error!.code).toBe('FILE_TOO_LARGE');
  });
});
