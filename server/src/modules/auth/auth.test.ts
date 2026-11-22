import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../app';
import { api, getCookie, lastEmailToken, loginAgent, newAgent, signupAgent, uniqueEmail } from '../../test/helpers';
import { AuditLog } from '../audit/auditLog.model';
import { User } from '../users/user.model';
import { Session } from './session.model';

describe('signup / login / me / logout', () => {
  it('signs up, sets httpOnly cookies, returns MeUser and sends a verification email', async () => {
    const email = uniqueEmail('signup');
    const agent = newAgent();
    const res = await agent.post(api('/auth/signup')).send({ name: 'Ali Raza', email, password: 'Passw0rd!' });
    expect(res.status).toBe(201);
    const u = res.body.data.user;
    expect(u).toMatchObject({ name: 'Ali Raza', email, emailVerified: false, activeMode: 'buyer', isSeller: false, stores: [] });
    expect(u.referralCode).toMatch(/^SQ[A-Z0-9]{6}$/);
    expect(u).not.toHaveProperty('passwordHash');
    const cookies = (res.headers['set-cookie'] as unknown as string[]).join('\n');
    expect(cookies).toMatch(/sq_at=.*HttpOnly/);
    expect(cookies).toMatch(/sq_rt=.*Path=\/api\/v1\/auth.*HttpOnly/);

    const me = await agent.get(api('/auth/me'));
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(email);

    const verify = await request(app).post(api('/auth/verify-email')).send({ token: lastEmailToken(email) });
    expect(verify.status).toBe(200);
    expect(verify.body.data.verified).toBe(true);
    const me2 = await agent.get(api('/auth/me'));
    expect(me2.body.data.user.emailVerified).toBe(true);
    // token is single use
    const again = await request(app).post(api('/auth/verify-email')).send({ token: lastEmailToken(email) });
    expect(again.status).toBe(400);
  });

  it('rejects duplicate emails and invalid bodies', async () => {
    const { email } = await signupAgent();
    const dup = await request(app).post(api('/auth/signup')).send({ name: 'X Y', email, password: 'Passw0rd!' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('EMAIL_TAKEN');

    const bad = await request(app).post(api('/auth/signup')).send({ name: 'X', email: 'nope', password: 'short' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(bad.body.error.details)).toBe(true);
  });

  it('logs in with correct credentials only, and audits both outcomes', async () => {
    const { email, password } = await signupAgent();
    const wrong = await request(app).post(api('/auth/login')).send({ email, password: 'Wrong123' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    const unknown = await request(app).post(api('/auth/login')).send({ email: uniqueEmail('ghost'), password: 'Wrong123' });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');

    const { res } = await loginAgent(email, password);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(email);

    const user = await User.findOne({ email });
    expect(await AuditLog.countDocuments({ actorId: user!._id, action: 'auth.login' })).toBe(1);
    expect(await AuditLog.countDocuments({ actorId: user!._id, action: 'auth.login_failed' })).toBe(1);
    const failed = await AuditLog.findOne({ actorId: user!._id, action: 'auth.login_failed' }).lean();
    expect(JSON.stringify(failed)).not.toContain('Wrong123');
  });

  it('logout revokes the session', async () => {
    const { agent } = await signupAgent();
    const out = await agent.post(api('/auth/logout'));
    expect(out.status).toBe(204);
    const me = await agent.get(api('/auth/me'));
    expect(me.status).toBe(401);
  });

  it('GET /auth/me without cookie is 401', async () => {
    const res = await request(app).get(api('/auth/me'));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('refresh token rotation', () => {
  it('rotates the refresh token and detects reuse of an old one', async () => {
    const { agent, res: signupRes, email } = await signupAgent();
    const oldRt = getCookie(signupRes, 'sq_rt')!;
    expect(oldRt).toBeTruthy();

    const r1 = await agent.post(api('/auth/refresh'));
    expect(r1.status).toBe(200);
    const newRt = getCookie(r1, 'sq_rt')!;
    expect(newRt).toBeTruthy();
    expect(newRt).not.toBe(oldRt);
    expect((await agent.get(api('/auth/me'))).status).toBe(200);

    // Move the rotation outside the concurrency grace window, then replay the old token.
    const oldSid = decodeURIComponent(oldRt).split('.')[0];
    await Session.updateOne({ _id: oldSid }, { $set: { revokedAt: new Date(Date.now() - 60_000) } });
    const replay = await request(app).post(api('/auth/refresh')).set('Cookie', `sq_rt=${oldRt}`);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('SESSION_REVOKED');

    // All sessions are revoked, including the legitimate new one.
    const user = await User.findOne({ email });
    expect(await Session.countDocuments({ userId: user!._id, revokedAt: null })).toBe(0);
    expect((await agent.post(api('/auth/refresh'))).status).toBe(401);
    expect(await AuditLog.countDocuments({ actorId: user!._id, action: 'auth.refresh_token_reuse' })).toBe(1);
  });

  it('refresh without a cookie is 401', async () => {
    const res = await request(app).post(api('/auth/refresh'));
    expect(res.status).toBe(401);
  });
});

describe('account lockout', () => {
  it('locks the account for 15 minutes after 5 failed attempts', async () => {
    const { email, password } = await signupAgent();
    for (let i = 0; i < 5; i++) {
      const r = await request(app).post(api('/auth/login')).send({ email, password: 'Wrong1234' });
      expect(r.status).toBe(401);
    }
    const locked = await request(app).post(api('/auth/login')).send({ email, password });
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(locked.body.error.details.retryAfterSeconds).toBeGreaterThan(800);

    // After the lock expires, the correct password works again.
    await User.updateOne({ email }, { $set: { lockUntil: new Date(Date.now() - 1000) } });
    const ok = await request(app).post(api('/auth/login')).send({ email, password });
    expect(ok.status).toBe(200);
  });
});

describe('forgot / reset password', () => {
  it('resets the password with the emailed token and revokes all sessions', async () => {
    const { agent, email, password } = await signupAgent();
    const forgot = await request(app).post(api('/auth/forgot-password')).send({ email });
    expect(forgot.status).toBe(200);
    const token = lastEmailToken(email);

    const reset = await request(app).post(api('/auth/reset-password')).send({ token, password: 'BrandNew99' });
    expect(reset.status).toBe(200);
    expect((await agent.get(api('/auth/me'))).status).toBe(401);
    expect((await loginAgent(email, password)).res.status).toBe(401);
    expect((await loginAgent(email, 'BrandNew99')).res.status).toBe(200);

    const reuse = await request(app).post(api('/auth/reset-password')).send({ token, password: 'Another99' });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error.code).toBe('INVALID_TOKEN');
  });

  it('returns 200 for unknown emails (no enumeration)', async () => {
    const res = await request(app).post(api('/auth/forgot-password')).send({ email: uniqueEmail('nobody') });
    expect(res.status).toBe(200);
    expect(res.body.data.sent).toBe(true);
  });
});

describe('phone OTP login', () => {
  const phone = '+923331234567';

  it('creates an account on first verify and logs in on later ones', async () => {
    const req1 = await request(app).post(api('/auth/otp/request')).send({ phone });
    expect(req1.status).toBe(200);
    expect(req1.body.data.sent).toBe(true);
    expect(req1.body.data.devCode).toMatch(/^\d{6}$/);

    const wrongCode = req1.body.data.devCode === '000000' ? '111111' : '000000';
    const wrong = await request(app).post(api('/auth/otp/verify')).send({ phone, code: wrongCode });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('OTP_INVALID');

    const agent = newAgent();
    const ok = await agent.post(api('/auth/otp/verify')).send({ phone, code: req1.body.data.devCode });
    expect(ok.status).toBe(200);
    expect(ok.body.data.isNew).toBe(true);
    expect(ok.body.data.user).toMatchObject({ name: 'Souqly Shopper', phone, phoneVerified: true });
    expect((await agent.get(api('/auth/me'))).status).toBe(200);

    // code is single-use
    const replay = await request(app).post(api('/auth/otp/verify')).send({ phone, code: req1.body.data.devCode });
    expect(replay.status).toBe(400);

    const req2 = await request(app).post(api('/auth/otp/request')).send({ phone });
    const again = await request(app).post(api('/auth/otp/verify')).send({ phone, code: req2.body.data.devCode });
    expect(again.status).toBe(200);
    expect(again.body.data.isNew).toBe(false);
  });

  it('invalidates the code after 5 wrong attempts', async () => {
    const p = '+923339876543';
    const r = await request(app).post(api('/auth/otp/request')).send({ phone: p });
    const code: string = r.body.data.devCode;
    const wrong = code === '123456' ? '654321' : '123456';
    for (let i = 0; i < 5; i++) {
      const w = await request(app).post(api('/auth/otp/verify')).send({ phone: p, code: wrong });
      expect(w.status).toBe(400);
    }
    const late = await request(app).post(api('/auth/otp/verify')).send({ phone: p, code });
    expect(late.status).toBe(400);
    expect(late.body.error.code).toBe('OTP_EXPIRED');
  });
});

describe('public config + health', () => {
  it('serves health and public config with fallbacks', async () => {
    const health = await request(app).get(api('/health'));
    expect(health.status).toBe(200);
    expect(health.body.data.status).toBe('ok');

    const cfg = await request(app).get(api('/config/public'));
    expect(cfg.status).toBe(200);
    expect(cfg.body.data.site.name).toBe('Souqly');
    expect(cfg.body.data.integrations.payments).toMatchObject({ cod: true, jazzcash: false, stripe: false });
    expect(cfg.body.data.integrations.googleLogin).toBe(false);
    expect(cfg.body.data.flags.referrals).toBe(true);
    expect(cfg.body.data.flags.aiDescriptionHelper).toBe(false);
    expect(cfg.body.data.devMode).toBe(true);
  });

  it('returns 404 JSON for unknown routes and google auth when not configured', async () => {
    expect((await request(app).get(api('/nope'))).body.error.code).toBe('NOT_FOUND');
    expect((await request(app).get(api('/auth/google'))).status).toBe(404);
  });
});
