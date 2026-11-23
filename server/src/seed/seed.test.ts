import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../app';
import { Brand } from '../modules/catalog/brand.model';
import { Category } from '../modules/catalog/category.model';
import { Campaign, FlashSale, HomeContent } from '../modules/catalog/marketing.models';
import { Product } from '../modules/catalog/product.model';
import { Store } from '../modules/stores/store.model';
import { StoreMember } from '../modules/stores/storeMember.model';
import { User } from '../modules/users/user.model';
import { setStorage, type StorageService } from '../services/storage';
import { api } from '../test/helpers';
import { clearDemoData } from './clear';
import { runSeed } from './seed';

const files = new Map<string, string>();
const memoryStorage: StorageService = {
  name: 'cloudinary', // non-local: clear deletes keys one by one
  async upload(buffer, opts) {
    const key = opts.fixedKey ?? `${opts.folder}/${files.size}`;
    files.set(key, buffer.toString('utf8'));
    return { url: `/uploads/${key}`, key };
  },
  async delete(key) {
    files.delete(key);
  },
};

beforeAll(() => setStorage(memoryStorage));
afterAll(() => setStorage(undefined));

describe('demo seed', () => {
  it('creates the demo catalog', async () => {
    const t0 = Date.now();
    await runSeed();
    expect(Date.now() - t0).toBeLessThan(20_000);
    const top = await Category.countDocuments({ demo: true, parentId: null });
    expect(top).toBeGreaterThanOrEqual(10);
    expect(await Brand.countDocuments({ demo: true })).toBeGreaterThanOrEqual(25);
    expect(await Store.countDocuments({ demo: true, status: 'approved' })).toBe(12);
    expect(await Store.countDocuments({ demo: true, isMall: true })).toBe(4);
    expect(await Store.countDocuments({ demo: true, status: 'pending' })).toBe(2);
    expect(await User.countDocuments({ demo: true, platformRole: 'MODERATOR' })).toBe(1);
    expect(await Store.countDocuments({ demo: true, 'holidayMode.enabled': true })).toBe(1);
    expect(await StoreMember.countDocuments({ demo: true, role: 'OWNER' })).toBe(14); // 12 live + 2 pending applications (Phase 9 admin queue);
    expect(await User.countDocuments({ demo: true, isSeller: true })).toBe(14);
    expect(await Product.countDocuments({ demo: true })).toBeGreaterThanOrEqual(200);
    expect(await Product.countDocuments({ demo: true, compareAtMin: { $exists: true } })).toBeGreaterThan(40);
    expect(await Product.countDocuments({ demo: true, totalStock: 0 })).toBeGreaterThan(0);
    expect(await Product.countDocuments({ demo: true, 'preOrder.enabled': true })).toBeGreaterThan(0);
    expect(await Product.countDocuments({ demo: true, 'wholesaleTiers.0': { $exists: true } })).toBeGreaterThan(0);
    expect((await HomeContent.findOne({ key: 'home' }).lean())!.heroSlides).toHaveLength(4);
    expect((await FlashSale.findOne({ demo: true }).lean())!.items.length).toBe(16);
    expect(await Campaign.countDocuments({ demo: true })).toBe(3);
    expect([...files.keys()].every((k) => k.startsWith('seed/'))).toBe(true);
    expect(files.get([...files.keys()].find((k) => k.startsWith('seed/products/'))!)).toMatch(/^<svg/);

    const owner = await request(app).post(api('/auth/login')).send({ email: 'noor@demo.souqly.pk', password: 'Demo1234' });
    expect(owner.status).toBe(200);
    expect(owner.body.data.user.stores[0]).toMatchObject({ slug: 'noor-textiles', role: 'OWNER' });
  });

  it('is deterministic and idempotent', async () => {
    const before = await Product.find({ demo: true }).select('slug soldCount priceMin').sort({ slug: 1 }).lean();
    await runSeed();
    expect(await Product.countDocuments({ demo: true })).toBe(before.length);
    expect(await Store.countDocuments({ demo: true })).toBe(14);
    await runSeed({ reset: true });
    const after = await Product.find({ demo: true }).select('slug soldCount priceMin').sort({ slug: 1 }).lean();
    expect(after.map(({ slug, soldCount, priceMin }) => ({ slug, soldCount, priceMin }))).toEqual(
      before.map(({ slug, soldCount, priceMin }) => ({ slug, soldCount, priceMin })),
    );
  });

  it('serves the seeded home and search', async () => {
    const home = await request(app).get(api('/home'));
    expect(home.body.data.categories.length).toBeGreaterThanOrEqual(10);
    expect(home.body.data.flashSale.items.length).toBeGreaterThan(10);
    const sugg = await request(app).get(api('/search/suggest?q=shrt'));
    expect(sugg.body.data.products.length).toBeGreaterThan(0);
  });

  it('clear removes all demo docs and seed files', async () => {
    await clearDemoData();
    for (const m of [Category, Brand, Store, Product, HomeContent, FlashSale, Campaign, StoreMember]) {
      expect(await (m as typeof Product).countDocuments({ demo: true })).toBe(0);
    }
    expect(await User.countDocuments({ demo: true })).toBe(0);
    expect(await User.countDocuments({ platformRole: 'SUPER_ADMIN' })).toBe(1);
    expect([...files.keys()].filter((k) => k.startsWith('seed/'))).toEqual([]);
  });
});
