import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../config/env';
import { decrypt } from '../../lib/crypto';
import { setStorage, type StorageService } from '../../services/storage';
import { makeCategoryTree, makeStore } from '../../test/catalogFixtures';
import { api, signupAgent, waitForEmail, xhr } from '../../test/helpers';
import { AuditLog } from '../audit/auditLog.model';
import { Store } from '../stores/store.model';
import { StoreMember } from '../stores/storeMember.model';
import { User } from '../users/user.model';

const memoryStorage: StorageService = {
  name: 'local',
  async upload(_buffer, opts) {
    const key = `${opts.folder}/${opts.filename}-${Math.random().toString(36).slice(2)}`;
    return { url: `/uploads/${key}`, key };
  },
  async delete() {},
};
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);

let categoryId = '';
beforeAll(async () => {
  setStorage(memoryStorage);
  categoryId = String((await makeCategoryTree()).sub._id);
});
afterAll(() => setStorage(undefined));

function onboardingBody(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Lahore Lawn House',
    slug: `lawn-house-${Date.now() % 1_000_000}`,
    categoryIds: [categoryId],
    themeColor: '#0E5E5A',
    contact: { email: 'shop@example.com', phone: '+923001234567' },
    pickupAddress: { fullName: 'Ali Khan', phone: '+923001234567', city: 'Lahore', line1: '12 Mall Road' },
    business: { type: 'individual', legalName: 'Ali Khan', cnicOrRegNo: '35202-1234567-1' },
    payout: { method: 'bank', accountTitle: 'Ali Khan', accountNumber: '0123456789012', bankName: 'HBL', iban: 'PK36SCBL0000001123456702' },
    acceptTerms: true,
    ...overrides,
  };
}

describe('GET /stores/slug-available', () => {
  it('applies slug rules: invalid, reserved, taken, available', async () => {
    const { agent } = await signupAgent();
    await makeStore({ slug: 'taken-slug' });
    const check = async (slug: string) => (await agent.get(api(`/stores/slug-available?slug=${encodeURIComponent(slug)}`))).body.data;
    expect(await check('ab')).toMatchObject({ available: false, reason: 'invalid' });
    expect(await check('-bad-start')).toMatchObject({ available: false, reason: 'invalid' });
    expect(await check('double--dash')).toMatchObject({ available: false, reason: 'invalid' });
    expect(await check('admin')).toMatchObject({ available: false, reason: 'reserved' });
    const taken = await check('taken-slug');
    expect(taken).toMatchObject({ available: false, reason: 'taken' });
    expect(taken.suggestion).toMatch(/^taken-slug-[a-z0-9]{4}$/);
    expect(await check('Fresh-Slug-1')).toEqual({ available: true });
  });
});

describe('POST /uploads/temp', () => {
  it('accepts an image into tmp/{userId} and rejects other types', async () => {
    const { agent, user } = await signupAgent();
    const ok = await agent.post(api('/uploads/temp')).attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.key.startsWith(`tmp/${user.id}/`)).toBe(true);
    const pdf = await agent.post(api('/uploads/temp')).attach('file', Buffer.from('%PDF-1.4 test'), { filename: 'cnic.pdf', contentType: 'application/pdf' });
    expect(pdf.body.data.mimetype).toBe('application/pdf');
    const html = await agent.post(api('/uploads/temp')).attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'x.png', contentType: 'image/png' });
    expect(html.status).toBe(400);
    expect((await xhr().post(api('/uploads/temp')).attach('file', PNG, 'a.png')).status).toBe(401);
  });
});

describe('POST /seller/onboarding', () => {
  it('creates a pending store, encrypts KYC/bank fields and only returns masked values', async () => {
    const { agent, user } = await signupAgent();
    const logo = (await agent.post(api('/uploads/temp')).attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' })).body.data;
    const body = onboardingBody({ logo: { url: logo.url, key: logo.key } });
    const res = await agent.post(api('/seller/onboarding')).send(body);
    expect(res.status).toBe(201);
    const s = res.body.data;
    expect(s).toMatchObject({ status: 'pending', slug: body.slug, myRole: 'OWNER' });
    expect(s.business.cnicOrRegNo).toBe('****5671');
    expect(s.payout).toMatchObject({ accountNumber: '****9012', iban: '****6702', bankName: 'HBL' });
    expect(s.checklist).toMatchObject({ logo: true, banner: false, firstProduct: false, payout: true, shipping: false });
    const raw = JSON.stringify(res.body);
    for (const secret of ['35202-1234567-1', '0123456789012', 'PK36SCBL0000001123456702']) expect(raw).not.toContain(secret);

    const doc = await Store.findById(s.id).select('+business +payout').lean();
    const business = doc!.business as Record<string, string>;
    const payout = doc!.payout as Record<string, string>;
    expect(JSON.stringify(doc)).not.toContain('0123456789012');
    expect(decrypt(business.cnicOrRegNoEnc!)).toBe('35202-1234567-1');
    expect(decrypt(payout.accountNumberEnc!)).toBe('0123456789012');
    expect(decrypt(payout.ibanEnc!)).toBe('PK36SCBL0000001123456702');

    expect(await StoreMember.findOne({ storeId: s.id, userId: user.id, role: 'OWNER', status: 'active' })).not.toBeNull();
    const u = await User.findById(user.id).lean();
    expect(u).toMatchObject({ isSeller: true, activeMode: 'seller' });
    const log = await AuditLog.findOne({ action: 'store.onboarded', targetId: s.id }).lean();
    expect(log).not.toBeNull();
    expect(JSON.stringify(log)).not.toContain('0123456789012');
    await waitForEmail(env.ADMIN_EMAIL, /New store awaiting review/);

    // GET /seller/store works for the pending store and stays masked.
    const get = await agent.get(api('/seller/store'));
    expect(get.status).toBe(200);
    expect(get.body.data.payout.accountNumber).toBe('****9012');

    // Second store for the same owner is refused.
    const again = await agent.post(api('/seller/onboarding')).send(onboardingBody());
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_SELLER');
  });

  it('rejects taken / reserved slugs, foreign media and missing terms', async () => {
    const other = await signupAgent();
    const foreign = (await other.agent.post(api('/uploads/temp')).attach('file', PNG, { filename: 'l.png', contentType: 'image/png' })).body.data;
    const { agent } = await signupAgent();
    await makeStore({ slug: 'already-here' });
    const taken = await agent.post(api('/seller/onboarding')).send(onboardingBody({ slug: 'already-here' }));
    expect(taken.status).toBe(409);
    expect(taken.body.error.details.reason).toBe('taken');
    expect((await agent.post(api('/seller/onboarding')).send(onboardingBody({ slug: 'checkout' }))).body.error.details.reason).toBe('reserved');
    const stolen = await agent.post(api('/seller/onboarding')).send(onboardingBody({ logo: { url: foreign.url, key: foreign.key } }));
    expect(stolen.status).toBe(400);
    expect(stolen.body.error.code).toBe('INVALID_MEDIA');
    const external = await agent.post(api('/seller/onboarding')).send(onboardingBody({ logo: { url: 'https://evil.example/x.png', key: 'x' } }));
    expect(external.status).toBe(400);
    expect((await agent.post(api('/seller/onboarding')).send(onboardingBody({ acceptTerms: false }))).status).toBe(400);
    expect((await agent.post(api('/seller/onboarding')).send(onboardingBody({ status: 'approved' }))).status).toBe(400);
  });
});

describe('admin approve / reject', () => {
  it('requires admin.stores.manage, is audited, and rejected stores can resubmit', async () => {
    const owner = await signupAgent();
    const created = await owner.agent.post(api('/seller/onboarding')).send(onboardingBody());
    const storeId = created.body.data.id;

    // Store owner / buyer cannot approve; MODERATOR has stores.view only.
    expect((await owner.agent.post(api(`/admin/stores/${storeId}/approve`))).status).toBe(403);
    const mod = await signupAgent();
    await User.updateOne({ email: mod.email }, { platformRole: 'MODERATOR' });
    expect((await mod.agent.post(api(`/admin/stores/${storeId}/approve`))).status).toBe(403);

    const admin = await signupAgent();
    await User.updateOne({ email: admin.email }, { platformRole: 'ADMIN' });
    expect((await admin.agent.post(api(`/admin/stores/${storeId}/reject`)).send({ reason: 'no' })).status).toBe(400);
    const rej = await admin.agent.post(api(`/admin/stores/${storeId}/reject`)).send({ reason: 'CNIC photo is not readable' });
    expect(rej.status).toBe(200);
    expect(rej.body.data).toMatchObject({ status: 'rejected', rejectionReason: 'CNIC photo is not readable' });
    expect(await AuditLog.exists({ action: 'admin.store_rejected', targetId: storeId })).not.toBeNull();
    await waitForEmail(owner.email, /needs changes/);

    // Rejected: locked out of the Seller Center, but can read the reason and resubmit business details.
    expect((await owner.agent.get(api('/seller/dashboard'))).status).toBe(403);
    const view = await owner.agent.get(api('/seller/store'));
    expect(view.body.data).toMatchObject({ status: 'rejected', rejectionReason: 'CNIC photo is not readable' });
    const fix = await owner.agent.patch(api('/seller/store/business')).send({ type: 'individual', legalName: 'Ali Khan', cnicOrRegNo: '35202-7654321-1' });
    expect(fix.status).toBe(200);
    expect(fix.body.data).toMatchObject({ status: 'pending' });
    expect(fix.body.data.business.cnicOrRegNo).toBe('****3211');
    expect(fix.body.data.rejectionReason).toBeUndefined();

    const ok = await admin.agent.post(api(`/admin/stores/${storeId}/approve`));
    expect(ok.body.data.status).toBe('approved');
    expect(await AuditLog.exists({ action: 'admin.store_approved', targetId: storeId })).not.toBeNull();
    expect((await admin.agent.post(api(`/admin/stores/${storeId}/approve`))).status).toBe(409);
    expect((await owner.agent.get(api('/seller/dashboard'))).status).toBe(200);
  });
});
