import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../app';
import { setStorage, type StorageService } from '../../services/storage';
import { makeCategoryTree } from '../../test/catalogFixtures';
import { api, getCookie, signupAgent } from '../../test/helpers';
import { Product } from '../catalog/product.model';
import { Store } from '../stores/store.model';
import { StoreMember } from '../stores/storeMember.model';
import { User } from '../users/user.model';

/** In-memory storage so tests never write to server/uploads. */
const uploaded: { key: string; mimetype: string; size: number }[] = [];
const memoryStorage: StorageService = {
  name: 'local',
  async upload(buffer, opts) {
    const key = `${opts.folder}/${opts.filename}-${uploaded.length}`;
    uploaded.push({ key, mimetype: opts.mimetype, size: buffer.length });
    return { url: `/uploads/${key}`, key };
  },
  async delete() {},
};

let cookieA = '';
let cookieB = '';
let cookieCashier = '';
let storeA = '';
let storeB = '';
let categoryId = '';
let productB = '';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);

function body(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Embroidered Lawn Suit',
    description: '<p onclick="steal()">Lovely <script>alert(1)</script><strong>lawn</strong></p>',
    categoryId,
    images: [{ url: '/uploads/stores/x/images/a.png', key: 'stores/x/images/a.png' }],
    options: [
      { key: 'color', name: 'Color', values: ['Red', 'Blue'] },
      { key: 'size', name: 'Size', values: ['S', 'M'] },
    ],
    variants: [
      { options: { color: 'Red', size: 'S' }, price: 300_000, compareAtPrice: 400_000, stock: 5 },
      { options: { color: 'Red', size: 'M' }, price: 320_000, stock: 0 },
      { options: { color: 'Blue', size: 'S' }, price: 300_000, stock: 7 },
      { options: { color: 'Blue', size: 'M' }, price: 320_000, stock: 2 },
    ],
    sizeGuide: '<table><tr><td>S</td></tr></table><img src=x onerror=alert(1)>',
    ...overrides,
  };
}

beforeAll(async () => {
  setStorage(memoryStorage);
  const a = await signupAgent({ name: 'Owner A' });
  const b = await signupAgent({ name: 'Owner B' });
  const c = await signupAgent({ name: 'Cashier A' });
  cookieA = `sq_at=${getCookie(a.res, 'sq_at')}`;
  cookieB = `sq_at=${getCookie(b.res, 'sq_at')}`;
  cookieCashier = `sq_at=${getCookie(c.res, 'sq_at')}`;
  const [ua, ub, uc] = await Promise.all([a.email, b.email, c.email].map((email) => User.findOne({ email })));
  const sA = await Store.create({ ownerId: ua!._id, name: 'Seller A', slug: 'seller-a', status: 'approved' });
  const sB = await Store.create({ ownerId: ub!._id, name: 'Seller B', slug: 'seller-b', status: 'approved', isMall: true });
  storeA = String(sA._id);
  storeB = String(sB._id);
  await StoreMember.create([
    { storeId: sA._id, userId: ua!._id, role: 'OWNER' },
    { storeId: sB._id, userId: ub!._id, role: 'OWNER' },
    { storeId: sA._id, userId: uc!._id, role: 'CASHIER' },
  ]);
  categoryId = String((await makeCategoryTree()).sub._id);
  const res = await request(app).post(api('/seller/products')).set('X-Requested-With', 'XMLHttpRequest').set('Cookie', cookieB).send(body({ title: 'Store B Kurta' }));
  expect(res.status).toBe(201);
  productB = res.body.data.id;
});

afterAll(() => setStorage(undefined));

describe('seller products CRUD', () => {
  it('creates a sanitized draft with derived fields', async () => {
    const res = await request(app).post(api('/seller/products')).set('X-Requested-With', 'XMLHttpRequest').set('Cookie', cookieA).send(body());
    expect(res.status).toBe(201);
    const p = res.body.data;
    expect(p).toMatchObject({ status: 'draft', priceMin: 300_000, priceMax: 320_000, discountPct: 25, totalStock: 14 });
    expect(p.description).toBe('<p>Lovely <strong>lawn</strong></p>');
    expect(p.sizeGuide).not.toMatch(/img|onerror/);
    expect(p.variants).toHaveLength(4);
    const doc = await Product.findById(p.id).lean();
    expect(String(doc!.storeId)).toBe(storeA);
    expect(doc!.searchText).toContain('shirts');
  });

  it('ignores storeId in the body (strict schema → 400) and always uses req.store', async () => {
    const res = await request(app).post(api('/seller/products')).set('X-Requested-With', 'XMLHttpRequest').set('Cookie', cookieA).send(body({ storeId: storeB }));
    expect(res.status).toBe(400);
    expect(await Product.countDocuments({ storeId: storeB, title: 'Embroidered Lawn Suit' })).toBe(0);
  });

  it('validates variants against options and rejects foreign media', async () => {
    const bad = body({ variants: [{ options: { color: 'Green', size: 'S' }, price: 1000, stock: 1 }] });
    expect((await request(app).post(api('/seller/products')).set('X-Requested-With', 'XMLHttpRequest').set('Cookie', cookieA).send(bad)).status).toBe(400);
    const evil = body({ images: [{ url: 'https://evil.example.com/x.png', key: 'x' }] });
    const res = await request(app).post(api('/seller/products')).set('X-Requested-With', 'XMLHttpRequest').set('Cookie', cookieA).send(evil);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_MEDIA');
  });

  it('updates, duplicates, publishes and deletes own products', async () => {
    const created = await request(app).post(api('/seller/products')).set('X-Requested-With', 'XMLHttpRequest').set('Cookie', cookieA).send(body({ title: 'To Edit' }));
    const id = created.body.data.id;
    const variantId = created.body.data.variants[0].id;
    const patch = await request(app)
      .patch(api(`/seller/products/${id}`))
      .set('X-Requested-With', 'XMLHttpRequest').set('Cookie', cookieA)
      .send({ title: 'Edited Title', variants: [{ id: variantId, options: { color: 'Red', size: 'S' }, price: 250_000, stock: 9 }] });
    expect(patch.status).toBe(200);
    expect(patch.body.data).toMatchObject({ title: 'Edited Title', priceMin: 250_000, totalStock: 9 });
    expect(patch.body.data.variants[0].id).toBe(variantId);

    const dup = await request(app).post(api(`/seller/products/${id}/duplicate`)).set('X-Requested-With', 'XMLHttpRequest').set('Cookie', cookieA);
    expect(dup.status).toBe(201);
    expect(dup.body.data).toMatchObject({ title: 'Edited Title (Copy)', status: 'draft' });
    expect(dup.body.data.slug).not.toBe(patch.body.data.slug);

    const pub = await request(app).post(api(`/seller/products/${id}/publish`)).set('X-Requested-With', 'XMLHttpRequest').set('Cookie', cookieA);
    expect(pub.body.data.status).toBe('pending_review'); // store A is not trusted
    const pubB = await request(app).post(api(`/seller/products/${productB}/publish`)).set('X-Requested-With', 'XMLHttpRequest').set('Cookie', cookieB);
    expect(pubB.body.data.status).toBe('published'); // Mall store → auto-published

    expect((await request(app).delete(api(`/seller/products/${id}`)).set('X-Requested-With', 'XMLHttpRequest').set('Cookie', cookieA)).status).toBe(204);
    expect((await request(app).get(api(`/seller/products/${id}`)).set('X-Requested-With', 'XMLHttpRequest').set('Cookie', cookieA)).status).toBe(404);
  });

  it('lists only the current store products', async () => {
    const res = await request(app).get(api('/seller/products?limit=100')).set('X-Requested-With', 'XMLHttpRequest').set('Cookie', cookieA);
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: { id: string }) => p.id)).not.toContain(productB);
  });
});

describe('tenant isolation', () => {
  it('owner of store A cannot GET, PATCH, DELETE, duplicate or publish store B product', async () => {
    const r = (m: 'get' | 'patch' | 'delete' | 'post', path: string) => request(app)[m](api(path)).set('X-Requested-With', 'XMLHttpRequest').set('Cookie', cookieA);
    expect((await r('get', `/seller/products/${productB}`)).status).toBe(404);
    expect((await r('patch', `/seller/products/${productB}`).send({ title: 'Hacked title' })).status).toBe(404);
    expect((await r('delete', `/seller/products/${productB}`)).status).toBe(404);
    expect((await r('post', `/seller/products/${productB}/duplicate`)).status).toBe(404);
    expect((await r('post', `/seller/products/${productB}/publish`)).status).toBe(404);
    const doc = await Product.findById(productB).lean();
    expect(doc!.title).toBe('Store B Kurta');
    expect(doc!.deletedAt).toBeUndefined();
  });

  it('x-store-id of a foreign store is refused', async () => {
    const res = await request(app).get(api(`/seller/products/${productB}`)).set('X-Requested-With', 'XMLHttpRequest').set('Cookie', cookieA).set('x-store-id', storeB);
    expect(res.status).toBe(403);
  });

  it('enforces store permissions (cashier can view, not manage)', async () => {
    expect((await request(app).get(api('/seller/products')).set('X-Requested-With', 'XMLHttpRequest').set('Cookie', cookieCashier)).status).toBe(200);
    expect((await request(app).post(api('/seller/products')).set('X-Requested-With', 'XMLHttpRequest').set('Cookie', cookieCashier).send(body())).status).toBe(403);
    expect((await request(app).get(api('/seller/products'))).status).toBe(401);
    expect(storeA).not.toBe(storeB);
  });
});

describe('POST /seller/uploads', () => {
  it('accepts a real PNG', async () => {
    const res = await request(app).post(api('/seller/uploads')).set('X-Requested-With', 'XMLHttpRequest').set('Cookie', cookieA).attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ kind: 'image', mimetype: 'image/png' });
    expect(res.body.data.key).toContain(`stores/${storeA}/images`);
  });

  it('rejects a fake .png that contains text', async () => {
    const fake = Buffer.from('<html><script>alert(1)</script></html>');
    const res = await request(app).post(api('/seller/uploads')).set('X-Requested-With', 'XMLHttpRequest').set('Cookie', cookieA).attach('file', fake, { filename: 'evil.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
  });

  it('accepts webm video and rejects images over 5 MB', async () => {
    const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(100)]);
    const v = await request(app).post(api('/seller/uploads')).set('X-Requested-With', 'XMLHttpRequest').set('Cookie', cookieA).attach('file', webm, { filename: 'v.webm', contentType: 'video/webm' });
    expect(v.status).toBe(201);
    expect(v.body.data.kind).toBe('video');
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
    const r = await request(app).post(api('/seller/uploads')).set('X-Requested-With', 'XMLHttpRequest').set('Cookie', cookieA).attach('file', big, { filename: 'big.png', contentType: 'image/png' });
    expect(r.status).toBe(413);
  });

  it('requires products.manage', async () => {
    const res = await request(app).post(api('/seller/uploads')).set('X-Requested-With', 'XMLHttpRequest').set('Cookie', cookieCashier).attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(403);
  });
});
