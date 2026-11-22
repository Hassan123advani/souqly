import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { requireAuth } from '../../middleware/auth';
import { errorHandler } from '../../middleware/error';
import { requirePermission } from '../../middleware/permissions';
import { storeContext } from '../../middleware/storeContext';
import { api, getCookie, signupAgent } from '../../test/helpers';
import { User } from '../users/user.model';
import { Store } from './store.model';
import { StoreMember } from './storeMember.model';

/** A tiny seller-style app: requireAuth + storeContext, echoing the resolved store. */
const sellerApp = express();
sellerApp.use(cookieParser());
sellerApp.get('/whoami', requireAuth, storeContext, (req, res) => {
  res.json({ data: { storeId: String(req.store!._id), permissions: req.storePermissions } });
});
sellerApp.get('/staff', requireAuth, storeContext, requirePermission('store.staff.manage'), (_req, res) => {
  res.json({ data: { ok: true } });
});
sellerApp.use(errorHandler);

let cookieA = '';
let cookieCashier = '';
let cookieNoStore = '';
let storeA = '';
let storeB = '';

beforeAll(async () => {
  const a = await signupAgent({ name: 'Owner A' });
  const b = await signupAgent({ name: 'Owner B' });
  const c = await signupAgent({ name: 'Cashier A' });
  const n = await signupAgent({ name: 'No Store' });
  cookieA = `sq_at=${getCookie(a.res, 'sq_at')}`;
  cookieCashier = `sq_at=${getCookie(c.res, 'sq_at')}`;
  cookieNoStore = `sq_at=${getCookie(n.res, 'sq_at')}`;

  const [ua, ub, uc] = await Promise.all([a.email, b.email, c.email].map((email) => User.findOne({ email })));
  const sA = await Store.create({ ownerId: ua!._id, name: 'Store A', slug: 'store-a', status: 'approved' });
  const sB = await Store.create({ ownerId: ub!._id, name: 'Store B', slug: 'store-b', status: 'approved' });
  storeA = String(sA._id);
  storeB = String(sB._id);
  await StoreMember.create([
    { storeId: sA._id, userId: ua!._id, role: 'OWNER' },
    { storeId: sB._id, userId: ub!._id, role: 'OWNER' },
    { storeId: sA._id, userId: uc!._id, role: 'CASHIER' },
  ]);
});

describe('storeContext tenant isolation', () => {
  it('uses the first store of the user when no header is sent', async () => {
    const res = await request(sellerApp).get('/whoami').set('Cookie', cookieA);
    expect(res.status).toBe(200);
    expect(res.body.data.storeId).toBe(storeA);
  });

  it('accepts x-store-id of a store the user belongs to', async () => {
    const res = await request(sellerApp).get('/whoami').set('Cookie', cookieA).set('x-store-id', storeA);
    expect(res.status).toBe(200);
    expect(res.body.data.storeId).toBe(storeA);
  });

  it('returns 403 when a member of store A sends x-store-id of store B', async () => {
    const res = await request(sellerApp).get('/whoami').set('Cookie', cookieA).set('x-store-id', storeB);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('STORE_FORBIDDEN');
  });

  it('rejects malformed store ids and users without a store', async () => {
    expect((await request(sellerApp).get('/whoami').set('Cookie', cookieA).set('x-store-id', 'abc')).status).toBe(400);
    const none = await request(sellerApp).get('/whoami').set('Cookie', cookieNoStore);
    expect(none.status).toBe(403);
    expect(none.body.error.code).toBe('NO_STORE');
    expect((await request(sellerApp).get('/whoami')).status).toBe(401);
  });

  it('derives permissions from the store role', async () => {
    const owner = await request(sellerApp).get('/staff').set('Cookie', cookieA);
    expect(owner.status).toBe(200);
    const cashier = await request(sellerApp).get('/staff').set('Cookie', cookieCashier);
    expect(cashier.status).toBe(403);
  });

  it('lists stores on MeUser', async () => {
    const res = await request((await import('../../app')).app).get(api('/auth/me')).set('Cookie', cookieA);
    expect(res.body.data.user.stores).toEqual([expect.objectContaining({ id: storeA, slug: 'store-a', role: 'OWNER', status: 'approved' })]);
  });
});
