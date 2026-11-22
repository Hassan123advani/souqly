import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../app';
import { env } from '../../config/env';
import { runSeed } from '../../seed/seed';
import { api, loginAgent, signupAgent } from '../../test/helpers';
import { AuditLog } from '../audit/auditLog.model';
import { authenticator } from '../auth/auth.service';
import { User } from '../users/user.model';

describe('change password', () => {
  it('revokes other sessions but keeps the current one', async () => {
    const { agent: a, email, password } = await signupAgent();
    const { agent: b } = await loginAgent(email, password);
    expect((await b.get(api('/auth/me'))).status).toBe(200);

    const wrong = await a
      .post(api('/account/change-password'))
      .send({ currentPassword: 'Nope1234', newPassword: 'NewPassw0rd', confirmPassword: 'NewPassw0rd' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('INVALID_PASSWORD');

    const res = await a
      .post(api('/account/change-password'))
      .send({ currentPassword: password, newPassword: 'NewPassw0rd', confirmPassword: 'NewPassw0rd' });
    expect(res.status).toBe(200);
    expect(res.body.data.revokedSessions).toBe(1);
    expect((await a.get(api('/auth/me'))).status).toBe(200);
    expect((await b.get(api('/auth/me'))).status).toBe(401);
    expect((await loginAgent(email, 'NewPassw0rd')).res.status).toBe(200);
  });
});

describe('seeded super admin', () => {
  it('logs in with the default credentials and clears passwordChangeRecommended after a change', async () => {
    await runSeed();
    await runSeed(); // idempotent
    expect(await User.countDocuments({ email: env.ADMIN_EMAIL })).toBe(1);
    expect(await User.countDocuments({ demo: true })).toBe(3);

    const { agent, res } = await loginAgent('souqly@gmail.com', 'souqly123');
    expect(res.status).toBe(200);
    const u = res.body.data.user;
    expect(u.platformRole).toBe('SUPER_ADMIN');
    expect(u.passwordChangeRecommended).toBe(true);
    expect(u.permissions).toContain('admin.staff.manage');

    const change = await agent
      .post(api('/account/change-password'))
      .send({ currentPassword: 'souqly123', newPassword: 'Str0ngerPass', confirmPassword: 'Str0ngerPass' });
    expect(change.status).toBe(200);
    const me = await agent.get(api('/auth/me'));
    expect(me.body.data.user.passwordChangeRecommended).toBe(false);

    // Re-seeding never overwrites the existing admin password.
    await runSeed();
    expect((await loginAgent('souqly@gmail.com', 'souqly123')).res.status).toBe(401);
    expect((await loginAgent('souqly@gmail.com', 'Str0ngerPass')).res.status).toBe(200);

    // Demo buyers can log in.
    expect((await loginAgent('ayesha@demo.souqly.pk', 'Demo1234')).res.status).toBe(200);
  });
});

describe('mode switch', () => {
  it('requires a store before switching to seller', async () => {
    const { agent } = await signupAgent();
    const res = await agent.post(api('/account/mode')).send({ mode: 'seller' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NEEDS_STORE');
    const buyer = await agent.post(api('/account/mode')).send({ mode: 'buyer' });
    expect(buyer.status).toBe(200);
    expect(buyer.body.data.user.activeMode).toBe('buyer');
  });

  it('switches when the user is a seller and audits it', async () => {
    const { agent, email } = await signupAgent();
    await User.updateOne({ email }, { $set: { isSeller: true } });
    const res = await agent.post(api('/account/mode')).send({ mode: 'seller' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.activeMode).toBe('seller');
    const user = await User.findOne({ email });
    expect(await AuditLog.countDocuments({ actorId: user!._id, action: 'account.mode_switched' })).toBe(1);
  });
});

describe('sessions', () => {
  it('lists sessions and revoke-all keeps only the current one', async () => {
    const { agent: a, email, password } = await signupAgent();
    const { agent: b } = await loginAgent(email, password);
    const list = await a.get(api('/account/sessions'));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(2);
    expect(list.body.data.filter((s: { current: boolean }) => s.current)).toHaveLength(1);

    const res = await a.post(api('/account/sessions/revoke-all')).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.revoked).toBe(1);
    expect((await b.get(api('/auth/me'))).status).toBe(401);
    expect((await a.get(api('/auth/me'))).status).toBe(200);

    const all = await a.post(api('/account/sessions/revoke-all')).send({ includeCurrent: true });
    expect(all.status).toBe(200);
    expect((await a.get(api('/auth/me'))).status).toBe(401);
  });

  it("cannot revoke another user's session", async () => {
    const { agent: a } = await signupAgent();
    const { agent: b } = await signupAgent();
    const bSessions = await b.get(api('/account/sessions'));
    const bId = bSessions.body.data[0].id;
    const res = await a.delete(api(`/account/sessions/${bId}`));
    expect(res.status).toBe(404);
    expect((await b.get(api('/auth/me'))).status).toBe(200);
  });
});

describe('2FA', () => {
  it('enables TOTP and then requires it at login', async () => {
    const { agent, email, password } = await signupAgent();
    const setup = await agent.post(api('/account/2fa/setup'));
    expect(setup.status).toBe(200);
    expect(setup.body.data.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    const secret: string = setup.body.data.secret;

    const bad = await agent.post(api('/account/2fa/enable')).send({ code: '000000' });
    expect([400]).toContain(bad.status);
    const en = await agent.post(api('/account/2fa/enable')).send({ code: authenticator.generate(secret) });
    expect(en.status).toBe(200);

    const stored = await User.findOne({ email }).select('+twoFactor.secretEncrypted').lean();
    expect(stored!.twoFactor.secretEncrypted).toBeTruthy();
    expect(stored!.twoFactor.secretEncrypted).not.toContain(secret);

    const noCode = await request(app).post(api('/auth/login')).send({ email, password });
    expect(noCode.status).toBe(401);
    expect(noCode.body.error.code).toBe('TOTP_REQUIRED');
    const withCode = await request(app).post(api('/auth/login')).send({ email, password, totp: authenticator.generate(secret) });
    expect(withCode.status).toBe(200);
    expect(withCode.body.data.user.twoFactorEnabled).toBe(true);

    const off = await agent.post(api('/account/2fa/disable')).send({ code: authenticator.generate(secret), password });
    expect(off.status).toBe(200);
    expect((await request(app).post(api('/auth/login')).send({ email, password })).status).toBe(200);
  });
});

describe('profile, preferences, addresses', () => {
  it('updates profile and preferences with whitelisted fields only', async () => {
    const { agent } = await signupAgent();
    const p = await agent.patch(api('/account/profile')).send({ name: 'New Name', phone: '923001234500' });
    expect(p.status).toBe(200);
    expect(p.body.data.user).toMatchObject({ name: 'New Name', phone: '+923001234500', phoneVerified: false });

    const mass = await agent.patch(api('/account/profile')).send({ platformRole: 'SUPER_ADMIN' });
    expect(mass.status).toBe(400);

    const prefs = await agent.patch(api('/account/preferences')).send({ language: 'ur', notifications: { marketing: true } });
    expect(prefs.status).toBe(200);
    expect(prefs.body.data.user.preferences.language).toBe('ur');
    expect(prefs.body.data.user.preferences.notifications).toMatchObject({ marketing: true, email: true });
  });

  it('manages addresses with a single default', async () => {
    const { agent } = await signupAgent();
    const base = { fullName: 'Ali Raza', phone: '+923001234567', city: 'Lahore', line1: '12 Main Boulevard' };
    const a1 = await agent.post(api('/account/addresses')).send(base);
    expect(a1.status).toBe(201);
    expect(a1.body.data.isDefault).toBe(true);
    const a2 = await agent.post(api('/account/addresses')).send({ ...base, label: 'Office', isDefault: true });
    expect(a2.body.data.isDefault).toBe(true);
    let list = await agent.get(api('/account/addresses'));
    expect(list.body.data.filter((a: { isDefault: boolean }) => a.isDefault)).toHaveLength(1);

    const upd = await agent.patch(api(`/account/addresses/${a1.body.data.id}`)).send({ city: 'Karachi' });
    expect(upd.body.data.city).toBe('Karachi');
    const def = await agent.post(api(`/account/addresses/${a1.body.data.id}/default`));
    expect(def.body.data.isDefault).toBe(true);
    expect((await agent.delete(api(`/account/addresses/${a1.body.data.id}`))).status).toBe(204);
    list = await agent.get(api('/account/addresses'));
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].isDefault).toBe(true);

    // another user cannot touch it
    const { agent: other } = await signupAgent();
    expect((await other.delete(api(`/account/addresses/${a2.body.data.id}`))).status).toBe(404);
  });
});

describe('export and delete account', () => {
  it('exports data and anonymizes the account on delete', async () => {
    const { agent, email, password } = await signupAgent();
    const exp = await agent.get(api('/account/export'));
    expect(exp.status).toBe(200);
    expect(exp.headers['content-disposition']).toContain('attachment');
    expect(exp.body.profile.email).toBe(email);
    expect(JSON.stringify(exp.body)).not.toContain('passwordHash');

    const bad = await agent.delete(api('/account')).send({ password, confirm: 'nope' });
    expect(bad.status).toBe(400);
    const del = await agent.delete(api('/account')).send({ password, confirm: 'DELETE' });
    expect(del.status).toBe(204);
    expect((await agent.get(api('/auth/me'))).status).toBe(401);
    expect((await loginAgent(email, password)).res.status).toBe(401);
    expect(await User.countDocuments({ email })).toBe(0);
    expect(await AuditLog.countDocuments({ action: 'account.deleted' })).toBeGreaterThan(0);
  });
});
