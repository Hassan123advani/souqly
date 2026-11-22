/**
 * Regression tests for docs/reviews/security-phase-1-2.md (H1-H3, M1-M6 and the testable LOWs).
 * Each describe block is named after the finding it covers.
 */
import cookieParser from 'cookie-parser';
import express from 'express';
import { Types } from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { app, loggableUrl } from '../../app';
import { env, parseEnv } from '../../config/env';
import { asyncHandler } from '../../lib/asyncHandler';
import { errorHandler } from '../../middleware/error';
import { runSeed } from '../../seed/seed';
import { consoleOutbox } from '../../services/email';
import { ConsoleEmailService } from '../../services/email/console';
import { isAllowedSocketOrigin } from '../../socket';
import { api, getCookie, newAgent, signupAgent, totpAt, uniqueEmail, waitForEmail, xhr } from '../../test/helpers';
import { AuditLog } from '../audit/auditLog.model';
import { User } from '../users/user.model';
import { type GoogleProfile, handleGoogleProfile } from './google';
import { Session } from './session.model';
import { signAccessToken } from './tokens';

/** Google callback without the network round-trip: the test sets the verified Google profile. */
let googleProfile: GoogleProfile = { sub: '', email: '' };
const googleApp = express();
googleApp.use(cookieParser());
googleApp.get(
  '/google',
  asyncHandler(async (req, res) => res.redirect(await handleGoogleProfile(req, res, googleProfile))),
);
googleApp.use(errorHandler);

async function enable2fa(agent: ReturnType<typeof newAgent>, password: string) {
  const setup = await agent.post(api('/account/2fa/setup')).send({ password });
  expect(setup.status).toBe(200);
  const secret: string = setup.body.data.secret;
  const en = await agent.post(api('/account/2fa/enable')).send({ code: totpAt(secret, -1), password });
  expect(en.status).toBe(200);
  return { secret, recoveryCodes: en.body.data.recoveryCodes as string[] };
}

const tokenOf = (text: string) => decodeURIComponent(text.match(/token=([A-Za-z0-9_%-]+)/)![1]!);

async function otpLogin(phone: string) {
  const r = await xhr().post(api('/auth/otp/request')).send({ phone });
  expect(r.status).toBe(200);
  const agent = newAgent();
  const v = await agent.post(api('/auth/otp/verify')).send({ phone, code: r.body.data.devCode });
  return { agent, res: v };
}

// ---------------------------------------------------------------------------------------------
// HIGH
// ---------------------------------------------------------------------------------------------

describe('H1 — Google login enforces 2FA', () => {
  it('issues a single-use ticket instead of a session and requires the TOTP at /auth/google/2fa', async () => {
    const { agent, email, password } = await signupAgent();
    await User.updateOne({ email }, { $set: { emailVerified: true } });
    const { secret } = await enable2fa(agent, password);

    googleProfile = { sub: `g-${Date.now()}`, email };
    const cb = await request(googleApp).get('/google');
    expect(cb.status).toBe(302);
    expect(cb.headers.location).toMatch(new RegExp(`^${env.CLIENT_URL}/login\\?google2fa=`));
    expect(getCookie(cb, 'sq_at')).toBeUndefined(); // no session yet
    const ticket = decodeURIComponent(new URL(cb.headers.location as string).searchParams.get('google2fa')!);

    const wrong = await xhr().post(api('/auth/google/2fa')).send({ ticket, totp: '000000' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_TOTP');
    expect(wrong.body.error.details.attemptsLeft).toBe(4);

    const g = newAgent();
    const ok = await g.post(api('/auth/google/2fa')).send({ ticket, totp: totpAt(secret, 0) });
    expect(ok.status).toBe(200);
    expect(ok.body.data.user.email).toBe(email);
    expect((await g.get(api('/auth/me'))).status).toBe(200);

    const reuse = await xhr().post(api('/auth/google/2fa')).send({ ticket, totp: totpAt(secret, 1) });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('INVALID_TICKET');
  });

  it('burns the ticket after 5 wrong codes', async () => {
    const { agent, email, password } = await signupAgent();
    await User.updateOne({ email }, { $set: { emailVerified: true } });
    const { secret } = await enable2fa(agent, password);
    googleProfile = { sub: `g2-${Date.now()}`, email };
    const cb = await request(googleApp).get('/google');
    const ticket = new URL(cb.headers.location as string).searchParams.get('google2fa')!;
    for (let i = 0; i < 5; i++) {
      expect((await xhr().post(api('/auth/google/2fa')).send({ ticket, totp: '000000' })).status).toBe(401);
    }
    const late = await xhr().post(api('/auth/google/2fa')).send({ ticket, totp: totpAt(secret, 0) });
    expect(late.status).toBe(401);
    expect(late.body.error.code).toBe('INVALID_TICKET');
  });
});

describe('H2 — Google never inherits an unverified account', () => {
  it('resets an unverified squatter account before linking', async () => {
    const victimEmail = uniqueEmail('victim');
    const { agent: squatter, password } = await signupAgent({ email: victimEmail }); // never verified
    expect((await squatter.get(api('/auth/me'))).status).toBe(200);

    googleProfile = { sub: `g-v-${Date.now()}`, email: victimEmail };
    const cb = await request(googleApp).get('/google');
    expect(cb.status).toBe(302);
    expect(cb.headers.location).toBe(env.CLIENT_URL);
    expect(getCookie(cb, 'sq_at')).toBeTruthy();

    expect((await squatter.get(api('/auth/me'))).status).toBe(401); // squatter's sessions revoked
    expect((await xhr().post(api('/auth/login')).send({ email: victimEmail, password })).status).toBe(401);
    const u = await User.findOne({ email: victimEmail }).select('+passwordHash').lean();
    expect(u!.passwordHash).toBeUndefined();
    expect(u!.googleId).toBe(googleProfile.sub);
    expect(u!.emailVerified).toBe(true);
    expect(await AuditLog.countDocuments({ actorId: u!._id, action: 'auth.google_link_reset' })).toBe(1);
  });

  it('links a verified account without touching its password', async () => {
    const { email, password } = await signupAgent();
    await User.updateOne({ email }, { $set: { emailVerified: true } });
    googleProfile = { sub: `g-ok-${Date.now()}`, email };
    expect((await request(googleApp).get('/google')).status).toBe(302);
    expect((await xhr().post(api('/auth/login')).send({ email, password })).status).toBe(200);
    const u = await User.findOne({ email }).lean();
    expect(u!.googleId).toBe(googleProfile.sub);
    expect(await AuditLog.countDocuments({ actorId: u!._id, action: 'auth.google_link_reset' })).toBe(0);
  });
});

const prodEnv = {
  NODE_ENV: 'production',
  MONGODB_URI: 'mongodb://db.internal:27017/souqly',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
  DATA_ENCRYPTION_KEY: 'c'.repeat(40),
  ADMIN_PASSWORD: 'Lantern-Souq-2026!',
};
const issuePaths = (r: ReturnType<typeof parseEnv>) => (r.success ? [] : r.error.issues.map((i) => i.path.join('.')));

describe('H3 — production refuses the default admin password and demo users', () => {
  it('env validation rejects a default / weak ADMIN_PASSWORD in production', () => {
    expect(parseEnv(prodEnv).success).toBe(true);
    const { ADMIN_PASSWORD: _omit, ...noPassword } = prodEnv;
    expect(issuePaths(parseEnv(noPassword))).toContain('ADMIN_PASSWORD'); // falls back to the default
    expect(issuePaths(parseEnv({ ...prodEnv, ADMIN_PASSWORD: 'souqly123' }))).toContain('ADMIN_PASSWORD');
    expect(issuePaths(parseEnv({ ...prodEnv, ADMIN_PASSWORD: 'Short1!' }))).toContain('ADMIN_PASSWORD');
    expect(parseEnv({ ...prodEnv, NODE_ENV: 'development', ADMIN_PASSWORD: 'souqly123' }).success).toBe(true);
  });

  it('seed refuses a weak admin password in production and skips demo users unless asked', async () => {
    await expect(runSeed({ production: true })).rejects.toThrow(/ADMIN_PASSWORD/);
    const original = env.ADMIN_PASSWORD;
    env.ADMIN_PASSWORD = 'Lantern-Souq-2026!';
    try {
      await runSeed({ production: true });
      expect(await User.countDocuments({ demo: true })).toBe(0);
      expect(await User.countDocuments({ email: env.ADMIN_EMAIL, platformRole: 'SUPER_ADMIN' })).toBe(1);
    } finally {
      env.ADMIN_PASSWORD = original;
    }
  });
});

// ---------------------------------------------------------------------------------------------
// MEDIUM
// ---------------------------------------------------------------------------------------------

describe('M1 — X-Forwarded-For is not trusted by default', () => {
  it('records the socket address, not a forged XFF header', async () => {
    const email = uniqueEmail('xff');
    await xhr().post(api('/auth/login')).set('X-Forwarded-For', '203.0.113.77').send({ email, password: 'Wrong1234' });
    const entry = await AuditLog.findOne({ action: 'auth.login_failed', 'meta.email': email }).lean();
    expect(entry).toBeTruthy();
    expect(entry!.ip).not.toBe('203.0.113.77');
  });

  it('TRUST_PROXY parses to false / hop count / list and `true` is refused in production', () => {
    const dev = { NODE_ENV: 'development' };
    const tp = (v?: string) => {
      const r = parseEnv({ ...dev, TRUST_PROXY: v });
      return r.success ? r.data.TRUST_PROXY : 'invalid';
    };
    expect(tp(undefined)).toBe(false);
    expect(tp('false')).toBe(false);
    expect(tp('1')).toBe(1);
    expect(tp('loopback, 10.0.0.0/8')).toBe('loopback, 10.0.0.0/8');
    expect(issuePaths(parseEnv({ ...prodEnv, TRUST_PROXY: 'true' }))).toContain('TRUST_PROXY');
    expect(parseEnv({ ...prodEnv, TRUST_PROXY: '1' }).success).toBe(true);
  });
});

describe('M2 — lockout holds under parallel attempts', () => {
  it('checks at most 5 passwords even when 15 guesses arrive at once', async () => {
    const { email, password } = await signupAgent();
    const results = await Promise.all(
      Array.from({ length: 15 }, (_, i) => xhr().post(api('/auth/login')).send({ email, password: `Wrong${i}abc` })),
    );
    expect(results.every((r) => r.status === 401)).toBe(true);
    const user = await User.findOne({ email }).lean();
    expect(await AuditLog.countDocuments({ actorId: user!._id, action: 'auth.login_failed', 'meta.reason': 'bad_password' })).toBe(5);
    expect(user!.lockUntil!.getTime()).toBeGreaterThan(Date.now());
    // Locked: even the right password is refused.
    expect((await xhr().post(api('/auth/login')).send({ email, password })).status).toBe(401);
  });
});

describe('M3 — 2FA needs re-auth, has recovery codes and sends notices', () => {
  it('requires the password for setup and enable', async () => {
    const { agent, password } = await signupAgent();
    const noPw = await agent.post(api('/account/2fa/setup')).send({});
    expect(noPw.status).toBe(400);
    expect(noPw.body.error.code).toBe('REAUTH_REQUIRED');
    const badPw = await agent.post(api('/account/2fa/setup')).send({ password: 'Nope12345' });
    expect(badPw.body.error.code).toBe('INVALID_PASSWORD');
    const setup = await agent.post(api('/account/2fa/setup')).send({ password });
    const en = await agent.post(api('/account/2fa/enable')).send({ code: totpAt(setup.body.data.secret, 0) });
    expect(en.status).toBe(400);
    expect(en.body.error.code).toBe('REAUTH_REQUIRED');
  });

  it('returns 8 hashed single-use recovery codes accepted at login, and emails notices', async () => {
    const { agent, email, password } = await signupAgent();
    const { secret, recoveryCodes } = await enable2fa(agent, password);
    expect(recoveryCodes).toHaveLength(8);
    expect(new Set(recoveryCodes).size).toBe(8);
    await waitForEmail(email, /turned on/);

    const stored = await User.findOne({ email }).select('+twoFactor.recoveryCodes').lean();
    expect(stored!.twoFactor.recoveryCodes).toHaveLength(8);
    expect(JSON.stringify(stored!.twoFactor.recoveryCodes)).not.toContain(recoveryCodes[0]!.replace('-', ''));

    const first = await xhr().post(api('/auth/login')).send({ email, password, totp: recoveryCodes[0] });
    expect(first.status).toBe(200);
    const again = await xhr().post(api('/auth/login')).send({ email, password, totp: recoveryCodes[0] });
    expect(again.status).toBe(401);
    expect(again.body.error.code).toBe('INVALID_TOTP');
    await waitForEmail(email, /recovery code/i);

    // Disable with a recovery code (lost device) + password; notice sent.
    const off = await agent.post(api('/account/2fa/disable')).send({ code: recoveryCodes[1], password });
    expect(off.status).toBe(200);
    await waitForEmail(email, /turned off/);
    expect(totpAt(secret)).toMatch(/^\d{6}$/);
  });

  it('passwordless accounts confirm with a fresh phone OTP', async () => {
    const { agent } = await otpLogin('+923451110001');
    const none = await agent.post(api('/account/2fa/setup')).send({});
    expect(none.body.error.code).toBe('REAUTH_REQUIRED');
    expect(none.body.error.details.method).toBe('otp');

    const otp = await agent.post(api('/account/reauth/otp')).send({});
    expect(otp.status).toBe(200);
    const otpCode: string = otp.body.data.devCode;
    const setup = await agent.post(api('/account/2fa/setup')).send({ otpCode });
    expect(setup.status).toBe(200);
    const en = await agent.post(api('/account/2fa/enable')).send({ code: totpAt(setup.body.data.secret, 0), otpCode });
    expect(en.status).toBe(200);
    // The OTP was consumed by enable.
    const off = await agent.post(api('/account/2fa/disable')).send({ code: totpAt(setup.body.data.secret, 1), otpCode });
    expect(off.status).toBe(400);
    expect(off.body.error.code).toBe('OTP_EXPIRED');
  });
});

describe('M4 — only verified phones identify accounts', () => {
  it('OTP login never enters an account holding the number unverified', async () => {
    const phone = '+923452220001';
    const squatter = await User.create({ name: 'Squatter', email: uniqueEmail('sq'), phone, phoneVerified: false, referralCode: `SQT${Date.now()}`.slice(0, 10) });
    const { res } = await otpLogin(phone);
    expect(res.status).toBe(200);
    expect(res.body.data.isNew).toBe(true);
    expect(res.body.data.user.id).not.toBe(String(squatter._id));
    expect((await User.findById(squatter._id).lean())!.phone).toBeUndefined();
  });

  it('a phone change stays pending until the OTP sent to the new number is confirmed', async () => {
    const { agent, password, user } = await signupAgent();
    const phone = '+923452220002';
    const p = await agent.patch(api('/account/profile')).send({ phone, password });
    expect(p.status).toBe(200);
    expect(p.body.data.user.pendingPhone).toBe(phone);
    expect(p.body.data.user.phone).toBeUndefined();
    const code: string = p.body.data.phoneVerification.devCode;

    const wrong = await agent.post(api('/account/phone/verify')).send({ code: code === '111111' ? '222222' : '111111' });
    expect(wrong.status).toBe(400);
    const ok = await agent.post(api('/account/phone/verify')).send({ code });
    expect(ok.status).toBe(200);
    expect(ok.body.data.user).toMatchObject({ phone, phoneVerified: true });
    expect(ok.body.data.user.pendingPhone).toBeUndefined();

    // Now the number logs into THIS account.
    const login = await otpLogin(phone);
    expect(login.res.body.data.isNew).toBe(false);
    expect(login.res.body.data.user.id).toBe(user.id);
  });

  it('a pending number can be claimed by its real owner first; the pending change then fails', async () => {
    const { agent, password } = await signupAgent();
    const phone = '+923452220003';
    const p = await agent.patch(api('/account/profile')).send({ phone, password });
    const owner = await otpLogin(phone); // the real SIM owner signs up
    expect(owner.res.body.data.isNew).toBe(true);
    const late = await agent.post(api('/account/phone/verify')).send({ code: p.body.data.phoneVerification.devCode });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('PHONE_TAKEN');
  });

  it('uniqueness applies to verified phones only', async () => {
    const phone = '+923452220004';
    await User.create({ name: 'A', phone, phoneVerified: false, referralCode: 'SQUNIQ01' });
    await expect(User.create({ name: 'B', phone, phoneVerified: false, referralCode: 'SQUNIQ02' })).resolves.toBeTruthy();
    await User.create({ name: 'C', phone, phoneVerified: true, referralCode: 'SQUNIQ03' });
    await expect(User.create({ name: 'D', phone, phoneVerified: true, referralCode: 'SQUNIQ04' })).rejects.toThrow(/duplicate key/);
  });
});

describe('M5 — console email fallback never prints secrets in production', () => {
  afterEach(() => vi.restoreAllMocks());

  it('redacts the body and keeps nothing in the outbox', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const before = consoleOutbox.length;
    await new ConsoleEmailService({ redact: true }).send({
      to: 'someone@example.com',
      subject: 'Reset your Souqly password',
      html: '<a href="https://x/reset-password?token=SECRET123">reset</a>',
      text: 'https://x/reset-password?token=SECRET123',
    });
    expect(consoleOutbox.length).toBe(before);
    const printed = [...warn.mock.calls, ...log.mock.calls].flat().join(' ');
    expect(printed).not.toContain('SECRET123');
    expect(printed).toContain('redacted');
  });
});

describe('M6 — OTP echo is an explicit dev-only opt-in', () => {
  it('env validation rejects DEV_OTP_ECHO in production and against a remote database', () => {
    expect(issuePaths(parseEnv({ ...prodEnv, DEV_OTP_ECHO: '1' }))).toContain('DEV_OTP_ECHO');
    const dev = { NODE_ENV: 'development', DEV_OTP_ECHO: '1' };
    expect(issuePaths(parseEnv({ ...dev, MONGODB_URI: 'mongodb+srv://u:p@cluster0.example.net/souqly' }))).toContain('DEV_OTP_ECHO');
    expect(parseEnv({ ...dev, MONGODB_URI: 'mongodb://127.0.0.1:27017/souqly' }).success).toBe(true);
    const r = parseEnv({ NODE_ENV: 'development' });
    expect(r.success && r.data.DEV_OTP_ECHO).toBe(false); // off unless set
  });

  it('does not return devCode when DEV_OTP_ECHO is off', async () => {
    env.DEV_OTP_ECHO = false;
    try {
      const r = await xhr().post(api('/auth/otp/request')).send({ phone: '+923453330001' });
      expect(r.status).toBe(200);
      expect(r.body.data).toEqual({ sent: true });
    } finally {
      env.DEV_OTP_ECHO = true;
    }
  });
});

// ---------------------------------------------------------------------------------------------
// LOW
// ---------------------------------------------------------------------------------------------

describe('L1 — change email hardening', () => {
  it('revokes other sessions, kills reset links and notifies the old address', async () => {
    const { agent, email, password } = await signupAgent();
    const other = newAgent();
    expect((await other.post(api('/auth/login')).send({ email, password })).status).toBe(200);
    await xhr().post(api('/auth/forgot-password')).send({ email });
    const resetToken = tokenOf((await waitForEmail(email, /reset/i)).text);

    const newEmail = uniqueEmail('moved');
    const res = await agent.post(api('/account/change-email')).send({ newEmail, password });
    expect(res.status).toBe(200);
    expect(res.body.data.revokedSessions).toBe(1);
    expect((await other.get(api('/auth/me'))).status).toBe(401);
    expect((await agent.get(api('/auth/me'))).status).toBe(200);
    const notice = await waitForEmail(email, /email address was changed/);
    expect(notice.text).not.toContain(newEmail); // masked
    const reset = await xhr().post(api('/auth/reset-password')).send({ token: resetToken, password: 'Takeover99' });
    expect(reset.status).toBe(400);
  });
});

describe('L3 — TOTP replay', () => {
  it('accepts each authenticator code only once', async () => {
    const { agent, email, password } = await signupAgent();
    const { secret } = await enable2fa(agent, password);
    const code = totpAt(secret, 0);
    expect((await xhr().post(api('/auth/login')).send({ email, password, totp: code })).status).toBe(200);
    const replay = await xhr().post(api('/auth/login')).send({ email, password, totp: code });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('INVALID_TOTP');
  });
});

describe('L5 — socket origin check', () => {
  it('only allows the client origin (or no Origin header)', () => {
    expect(isAllowedSocketOrigin(new URL(env.CLIENT_URL).origin)).toBe(true);
    expect(isAllowedSocketOrigin(undefined)).toBe(true);
    expect(isAllowedSocketOrigin('https://evil.example')).toBe(false);
  });
});

describe('L6 — OTP rate limits', () => {
  afterEach(() => {
    delete process.env.TEST_RATE_LIMIT;
  });

  it('keys on the normalized phone, keeps verify separate and caps each IP', async () => {
    process.env.TEST_RATE_LIMIT = '1';
    // Both spellings normalize to +923454440001 and share one bucket.
    const variants = ['+923454440001', '923454440001', '+923454440001', '923454440001', ' 923454440001 '];
    for (const phone of variants) {
      expect((await xhr().post(api('/auth/otp/request')).send({ phone })).status).toBe(200);
    }
    const sixth = await xhr().post(api('/auth/otp/request')).send({ phone: '923454440001' });
    expect(sixth.status).toBe(429);
    // Verification has its own budget.
    const verify = await xhr().post(api('/auth/otp/verify')).send({ phone: '+923454440001', code: '000000' });
    expect(verify.status).not.toBe(429);
    // Per-IP cap: 20 requests / 15 min across different numbers (5 already used above).
    const codes: number[] = [];
    for (let i = 0; i < 16; i++) {
      codes.push((await xhr().post(api('/auth/otp/request')).send({ phone: `+92345555${String(i).padStart(4, '0')}` })).status);
    }
    expect(codes.slice(0, 15).every((c) => c === 200)).toBe(true);
    expect(codes[15]).toBe(429);
  });
});

describe('L7 — no credential changes while impersonating', () => {
  it('returns 403 IMPERSONATION_FORBIDDEN on every security endpoint', async () => {
    const { user } = await signupAgent();
    const { user: admin } = await signupAgent();
    const sid = new Types.ObjectId();
    await Session.create({
      _id: sid,
      userId: new Types.ObjectId(user.id),
      refreshTokenHash: 'impersonation-test',
      expiresAt: new Date(Date.now() + 3600_000),
      impersonatorId: new Types.ObjectId(admin.id),
    });
    const at = signAccessToken({ sub: user.id, sid: String(sid), imp: admin.id });
    const as = () => xhr().set('Cookie', `sq_at=${at}`);

    const calls = [
      as().post(api('/account/change-password')).send({ currentPassword: 'Passw0rd!', newPassword: 'NewPassw0rd', confirmPassword: 'NewPassw0rd' }),
      as().post(api('/account/change-email')).send({ newEmail: uniqueEmail('imp'), password: 'Passw0rd!' }),
      as().post(api('/account/2fa/setup')).send({ password: 'Passw0rd!' }),
      as().post(api('/account/2fa/enable')).send({ code: '123456', password: 'Passw0rd!' }),
      as().post(api('/account/2fa/disable')).send({ code: '123456', password: 'Passw0rd!' }),
      as().post(api('/account/sessions/revoke-all')).send({}),
      as().delete(api('/account')).send({ password: 'Passw0rd!', confirm: 'DELETE' }),
      as().patch(api('/account/profile')).send({ phone: '+923456660001', password: 'Passw0rd!' }),
      as().post(api('/account/phone/verify')).send({ code: '123456' }),
      as().post(api('/account/reauth/otp')).send({}),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('IMPERSONATION_FORBIDDEN');
    }
    // Harmless edits still work.
    expect((await as().patch(api('/account/profile')).send({ name: 'Renamed' })).status).toBe(200);
  });
});

describe('L9 — JSON-only mutations (CSRF)', () => {
  it('rejects form, text and header-less bodyless mutations with 415', async () => {
    const form = await request(app).post(api('/auth/login')).type('form').send('email=a%40b.c&password=x');
    expect(form.status).toBe(415);
    expect(form.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');

    const text = await request(app).post(api('/auth/login')).set('Content-Type', 'text/plain').send('{"email":"a@b.c"}');
    expect(text.status).toBe(415);
    const bare = await request(app).post(api('/auth/logout'));
    expect(bare.status).toBe(415);
    const withHeader = await request(app).post(api('/auth/logout')).set('X-Requested-With', 'XMLHttpRequest');
    expect(withHeader.status).toBe(204);
    const multipartElsewhere = await request(app).post(api('/auth/login')).field('email', 'a@b.c').field('password', 'x');
    expect(multipartElsewhere.status).toBe(415);
    const json = await request(app).post(api('/auth/login')).send({ email: uniqueEmail('j'), password: 'x' });
    expect(json.status).toBe(401);
  });
});

describe('L11 — OAuth callback query strings are not logged', () => {
  it('redacts the query of the Google callback only', () => {
    expect(loggableUrl('/api/v1/auth/google/callback?code=abc&state=xyz')).toBe('/api/v1/auth/google/callback?[REDACTED]');
    expect(loggableUrl('/api/v1/products?q=kurta')).toBe('/api/v1/products?q=kurta');
  });
});
