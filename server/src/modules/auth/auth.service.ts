import type { LoginInput, SignupInput } from '@souqly/shared';
import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import otplib from 'otplib';
import { env, integrations, isProd, isTest } from '../../config/env';
import { AppError } from '../../lib/AppError';
import { decrypt, randomCode, randomDigits, randomToken, safeEqual, sha256 } from '../../lib/crypto';
import { logger } from '../../lib/logger';
import { normalizePhone } from '../../lib/phone';
import { getEmail } from '../../services/email';
import * as templates from '../../services/email/templates';
import { getNotifier } from '../../services/notify';
import { disconnectSessionSockets, disconnectUserSockets } from '../../socket';
import { audit } from '../audit/audit.service';
import { User, type UserDoc } from '../users/user.model';
import { generateReferralCode } from '../users/user.service';
import { Otp, type OtpPurpose } from './otp.model';
import { Session, type SessionDoc } from './session.model';
import { Token } from './token.model';
import { REFRESH_COOKIE, REFRESH_TTL_MS, clearAuthCookies, setAuthCookies, signAccessToken } from './tokens';

export { normalizePhone };

// ---------------------------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------------------------

/** bcrypt cost 12 (4 in tests only, to keep the suite fast). */
export const BCRYPT_ROUNDS = isTest ? 4 : 12;
const DUMMY_HASH = bcrypt.hashSync('souqly-timing-equalizer', BCRYPT_ROUNDS);

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/** Always runs a bcrypt comparison (even without a hash) so response time does not reveal whether an account exists. */
export async function verifyPassword(password: string, hash: string | undefined | null): Promise<boolean> {
  const ok = await bcrypt.compare(password, hash ?? DUMMY_HASH);
  return ok && !!hash;
}

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MS = 15 * 60_000;

// ---------------------------------------------------------------------------------------------
// TOTP (2FA) + recovery codes
// ---------------------------------------------------------------------------------------------

export const authenticator = otplib.authenticator;
authenticator.options = { window: 1 };
const TOTP_STEP_SECONDS = 30;

/** Returns the absolute time step the code belongs to, or null when it does not match. */
function totpStep(code: string, secretEncrypted: string | undefined): number | null {
  if (!secretEncrypted || !/^\d{6}$/.test(code)) return null;
  let secret: string;
  try {
    secret = decrypt(secretEncrypted);
  } catch (err) {
    logger.error({ err }, 'Could not decrypt 2FA secret');
    return null;
  }
  const delta = authenticator.checkDelta(code, secret);
  if (delta === null || delta === undefined) return null;
  return Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS) + delta;
}

/** Pure TOTP check without replay protection (only used to confirm a PENDING secret). */
export function checkTotp(code: string, secretEncrypted: string | undefined): boolean {
  return totpStep(code, secretEncrypted) !== null;
}

/**
 * Verifies a TOTP against `secretEncrypted` and atomically records its time step on the user, so the
 * same (or an older) code is never accepted twice.
 */
export async function consumeTotp(userId: Types.ObjectId | string, code: string, secretEncrypted: string | undefined): Promise<boolean> {
  const step = totpStep(code, secretEncrypted);
  if (step === null) return false;
  const r = await User.updateOne(
    { _id: new Types.ObjectId(String(userId)), $or: [{ 'twoFactor.lastStep': null }, { 'twoFactor.lastStep': { $lt: step } }] },
    { $set: { 'twoFactor.lastStep': step } },
  );
  return r.modifiedCount === 1;
}

export const RECOVERY_CODE_COUNT = 8;
const normalizeRecoveryCode = (code: string) => code.replace(/[\s-]/g, '').toUpperCase();
const recoveryHash = (code: string) => sha256(`recovery:${normalizeRecoveryCode(code)}`);

/** 8 single-use codes like `K7PQM-3XH9D`. Only their sha256 is stored; the plain codes are shown once. */
export function generateRecoveryCodes(): { codes: string[]; stored: { hash: string }[] } {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const c = randomCode(10);
    return `${c.slice(0, 5)}-${c.slice(5)}`;
  });
  return { codes, stored: codes.map((c) => ({ hash: recoveryHash(c) })) };
}

/** Atomically marks one unused recovery code as used. */
export async function consumeRecoveryCode(userId: Types.ObjectId | string, code: string): Promise<boolean> {
  const r = await User.updateOne(
    { _id: new Types.ObjectId(String(userId)), 'twoFactor.recoveryCodes': { $elemMatch: { hash: recoveryHash(code), usedAt: null } } },
    { $set: { 'twoFactor.recoveryCodes.$.usedAt': new Date() } },
  );
  return r.modifiedCount === 1;
}

/**
 * Second factor (login, Google 2FA step, disabling 2FA): a replay-protected TOTP or one single-use
 * recovery code. `user` must have `+twoFactor.secretEncrypted` selected.
 */
export async function verifySecondFactor(user: UserDoc, code: string, req?: Request): Promise<'totp' | 'recovery' | null> {
  const c = code.trim();
  if (/^\d{6}$/.test(c)) return (await consumeTotp(user._id, c, user.twoFactor?.secretEncrypted)) ? 'totp' : null;
  if (!(await consumeRecoveryCode(user._id, c))) return null;
  await audit({ action: 'auth.recovery_code_used', actorId: user._id, targetType: 'User', targetId: user._id, req });
  await notifySecurityEvent(user, 'recovery_code_used');
  return 'recovery';
}

// ---------------------------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------------------------

/** A rotated-out refresh token presented after this grace period is treated as theft. */
const REUSE_GRACE_MS = 15_000;
/** Rotated (revoked) session docs are kept this long for reuse detection, then TTL-deleted. */
const ROTATED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function clientInfo(req: Request) {
  return { userAgent: (req.get('user-agent') ?? '').slice(0, 300), ip: (req.ip ?? '').slice(0, 64) };
}

function issueTokens(res: Response, session: SessionDoc, refreshToken: string) {
  const access = signAccessToken({
    sub: String(session.userId),
    sid: String(session._id),
    ...(session.impersonatorId ? { imp: String(session.impersonatorId) } : {}),
  });
  setAuthCookies(res, access, refreshToken);
}

/** Creates a session for the user and sets the auth cookies. */
export async function startSession(
  req: Request,
  res: Response,
  userId: Types.ObjectId,
  opts: { impersonatorId?: Types.ObjectId } = {},
): Promise<SessionDoc> {
  const _id = new Types.ObjectId();
  const refreshToken = `${_id}.${randomToken(32)}`;
  const session = await Session.create({
    _id,
    userId,
    refreshTokenHash: sha256(refreshToken),
    ...clientInfo(req),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    impersonatorId: opts.impersonatorId,
  });
  issueTokens(res, session, refreshToken);
  return session;
}

/**
 * Rotates the refresh token: the presented session is revoked (replacedBy → new session) and a new
 * session with fresh tokens is issued. Presenting an already-rotated token (outside a short grace
 * window for concurrent tabs) revokes ALL of the user's sessions.
 */
export async function rotateRefreshToken(req: Request, res: Response): Promise<SessionDoc> {
  const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
  const fail = (code = 'UNAUTHENTICATED', message = 'Please log in to continue', clear = true) => {
    if (clear) clearAuthCookies(res);
    return new AppError(401, code, message);
  };
  if (!token || typeof token !== 'string') throw fail();
  const sid = token.split('.')[0] ?? '';
  if (!Types.ObjectId.isValid(sid)) throw fail();

  const session = await Session.findById(sid);
  if (!session || !safeEqual(session.refreshTokenHash, sha256(token))) throw fail();

  const now = new Date();
  if (session.revokedAt) {
    if (session.replacedBy) {
      if (now.getTime() - session.revokedAt.getTime() <= REUSE_GRACE_MS) {
        // Another tab refreshed a moment ago; the browser already holds the new cookies. Do not clear them.
        throw fail('SESSION_ROTATED', 'Session was refreshed in another tab', false);
      }
      const revoked = await revokeAllSessions(session.userId);
      await audit({
        action: 'auth.refresh_token_reuse',
        actorId: session.userId,
        targetType: 'User',
        targetId: session.userId,
        meta: { sessionId: String(session._id), revokedSessions: revoked },
        req,
      });
      logger.warn({ userId: String(session.userId) }, 'Refresh token reuse detected; all sessions revoked');
      throw fail('SESSION_REVOKED', 'For your security, you have been logged out of all devices. Please log in again.');
    }
    throw fail('SESSION_REVOKED', 'Your session has ended. Please log in again.');
  }
  if (session.expiresAt <= now) throw fail('SESSION_EXPIRED', 'Your session has expired. Please log in again.');

  const user = await User.findById(session.userId).select('status').lean();
  if (!user || user.status !== 'active') {
    await Session.updateOne({ _id: session._id }, { $set: { revokedAt: now } });
    throw fail();
  }

  const newId = new Types.ObjectId();
  // Atomic claim: only one concurrent refresh can rotate this session.
  const claimed = await Session.findOneAndUpdate(
    { _id: session._id, revokedAt: null, refreshTokenHash: session.refreshTokenHash },
    { $set: { revokedAt: now, replacedBy: newId, expiresAt: new Date(Math.min(session.expiresAt.getTime(), now.getTime() + ROTATED_RETENTION_MS)) } },
  );
  if (!claimed) throw fail('SESSION_ROTATED', 'Session was refreshed in another tab', false);

  const refreshToken = `${newId}.${randomToken(32)}`;
  const next = await Session.create({
    _id: newId,
    userId: session.userId,
    refreshTokenHash: sha256(refreshToken),
    ...clientInfo(req),
    createdAt: session.createdAt,
    lastUsedAt: now,
    expiresAt: new Date(now.getTime() + REFRESH_TTL_MS),
    impersonatorId: session.impersonatorId,
  });
  issueTokens(res, next, refreshToken);
  return next;
}

/** Looks up the (possibly revoked) session a refresh token belongs to, verifying the token hash. */
export async function findSessionByRefreshToken(token: unknown) {
  if (typeof token !== 'string') return null;
  const sid = token.split('.')[0] ?? '';
  if (!Types.ObjectId.isValid(sid)) return null;
  const s = await Session.findById(sid).select('userId refreshTokenHash').lean();
  return s && safeEqual(s.refreshTokenHash, sha256(token)) ? s : null;
}

export async function revokeSession(sessionId: string | Types.ObjectId, userId?: Types.ObjectId | string): Promise<boolean> {
  const filter: Record<string, unknown> = { _id: new Types.ObjectId(String(sessionId)), revokedAt: null };
  if (userId) filter.userId = new Types.ObjectId(String(userId));
  const r = await Session.updateOne(filter, { $set: { revokedAt: new Date() } });
  if (r.modifiedCount > 0) disconnectSessionSockets(String(sessionId));
  return r.modifiedCount > 0;
}

/** Revokes all active sessions of a user, optionally keeping one. Returns the count. */
export async function revokeAllSessions(userId: Types.ObjectId | string, exceptSessionId?: string): Promise<number> {
  const filter: Record<string, unknown> = { userId: new Types.ObjectId(String(userId)), revokedAt: null };
  if (exceptSessionId) filter._id = { $ne: new Types.ObjectId(exceptSessionId) };
  const r = await Session.updateMany(filter, { $set: { revokedAt: new Date() } });
  // Sockets authenticate only at the handshake, so revoked sessions are kicked explicitly.
  await disconnectUserSockets(String(userId), exceptSessionId);
  return r.modifiedCount;
}

// ---------------------------------------------------------------------------------------------
// Signup / login
// ---------------------------------------------------------------------------------------------

export async function signup(input: SignupInput, req: Request): Promise<UserDoc> {
  if (await User.exists({ email: input.email })) {
    throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
  }
  let referredBy: Types.ObjectId | undefined;
  if (input.referralCode) {
    const ref = await User.findOne({ referralCode: input.referralCode.toUpperCase(), status: 'active' }).select('_id').lean();
    referredBy = ref?._id;
  }
  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    referralCode: await generateReferralCode(),
    referredBy,
    lastLoginAt: new Date(),
  });
  await audit({ action: 'auth.signup', actorId: user._id, targetType: 'User', targetId: user._id, req });
  await sendVerificationEmail(user);
  return user;
}

// Lockout: every attempt is RESERVED atomically before bcrypt runs, so parallel guesses can never test
// more than MAX_FAILED_LOGINS passwords per lock window.
const notLocked = (now: Date) => ({ $or: [{ lockUntil: null }, { lockUntil: { $lte: now } }] });

/** Reserves one login attempt. Returns false while the account is locked or all attempts are in flight. */
export async function reserveLoginAttempt(userId: Types.ObjectId): Promise<boolean> {
  const now = new Date();
  const r = await User.updateOne(
    { _id: userId, failedLoginCount: { $lt: MAX_FAILED_LOGINS }, ...notLocked(now) },
    { $inc: { failedLoginCount: 1 }, $unset: { lockUntil: 1 } },
  );
  if (r.modifiedCount === 1) return true;
  await lockIfExhausted(userId); // self-heals a counter stuck at the limit without a lock
  return false;
}

/** After a failed check: starts the 15-minute lock once the reserved attempts are used up. */
async function lockIfExhausted(userId: Types.ObjectId): Promise<void> {
  const now = new Date();
  await User.updateOne(
    { _id: userId, failedLoginCount: { $gte: MAX_FAILED_LOGINS }, ...notLocked(now) },
    { $set: { lockUntil: new Date(now.getTime() + LOCK_MS), failedLoginCount: 0 } },
  );
}

/** Gives a reserved attempt back (correct password, 2FA code not sent yet / blocked account). */
async function releaseLoginAttempt(userId: Types.ObjectId): Promise<void> {
  await User.updateOne({ _id: userId, failedLoginCount: { $gt: 0 } }, { $inc: { failedLoginCount: -1 } });
}

/** Resets the counter on success, but only if no concurrent failure locked the account meanwhile. */
async function completeLogin(user: UserDoc): Promise<boolean> {
  const now = new Date();
  const r = await User.updateOne(
    { _id: user._id, ...notLocked(now) },
    { $set: { failedLoginCount: 0, lastLoginAt: now }, $unset: { lockUntil: 1 } },
  );
  if (r.matchedCount !== 1) return false;
  user.failedLoginCount = 0;
  user.lockUntil = undefined;
  user.lastLoginAt = now;
  return true;
}

/** One response for unknown account, wrong password AND locked account (no enumeration via a 423). */
export const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect. After 5 failed attempts, sign-in is paused for 15 minutes.');

export async function login(input: LoginInput, req: Request): Promise<UserDoc> {
  const user = await User.findOne({ email: input.email, status: { $ne: 'deleted' } }).select(
    '+passwordHash +twoFactor.secretEncrypted',
  );
  if (!user || !user.passwordHash) {
    await verifyPassword(input.password, null);
    await audit({ action: 'auth.login_failed', meta: { reason: 'unknown_account', email: input.email }, req });
    throw invalidCredentials();
  }
  if (!(await reserveLoginAttempt(user._id))) {
    await verifyPassword(input.password, null); // same timing as a real check
    await audit({ action: 'auth.login_failed', actorId: user._id, meta: { reason: 'locked' }, req });
    throw invalidCredentials();
  }
  if (!(await verifyPassword(input.password, user.passwordHash))) {
    await lockIfExhausted(user._id);
    await audit({ action: 'auth.login_failed', actorId: user._id, meta: { reason: 'bad_password' }, req });
    throw invalidCredentials();
  }
  if (user.status === 'blocked') {
    await releaseLoginAttempt(user._id);
    await audit({ action: 'auth.login_failed', actorId: user._id, meta: { reason: 'blocked' }, req });
    throw new AppError(403, 'ACCOUNT_BLOCKED', 'This account has been blocked. Please contact support.');
  }
  if (user.twoFactor?.enabled) {
    if (!input.totp) {
      await releaseLoginAttempt(user._id);
      throw new AppError(401, 'TOTP_REQUIRED', 'Enter the 6-digit code from your authenticator app');
    }
    if (!(await verifySecondFactor(user, input.totp, req))) {
      await lockIfExhausted(user._id);
      await audit({ action: 'auth.login_failed', actorId: user._id, meta: { reason: 'bad_totp' }, req });
      throw new AppError(401, 'INVALID_TOTP', 'The authenticator or recovery code is incorrect');
    }
  }
  if (!(await completeLogin(user))) throw invalidCredentials();
  await audit({ action: 'auth.login', actorId: user._id, meta: { method: 'password' }, req });
  return user;
}

// ---------------------------------------------------------------------------------------------
// Google 2FA ticket
// ---------------------------------------------------------------------------------------------

const GOOGLE_2FA_TTL_MS = 5 * 60_000;
export const GOOGLE_2FA_MAX_ATTEMPTS = 5;

/** Short-lived single-use ticket the Google callback hands to the client when the account has 2FA. */
export async function issueGoogle2faTicket(userId: Types.ObjectId, next?: string): Promise<string> {
  await Token.updateMany({ userId, type: 'google_2fa', usedAt: null }, { $set: { usedAt: new Date() } });
  const ticket = randomToken(32);
  const safeNext = safeNextPath(next);
  await Token.create({ type: 'google_2fa', userId, tokenHash: sha256(ticket), expiresAt: new Date(Date.now() + GOOGLE_2FA_TTL_MS), ...(safeNext ? { next: safeNext } : {}) });
  return ticket;
}

/**
 * Only same-origin relative paths are accepted as a post-login `next` (no `//host`, `/\host`,
 * schemes or control characters), so it can never become an open redirect.
 */
export function safeNextPath(next: unknown): string | undefined {
  if (typeof next !== 'string' || next.length === 0 || next.length > 300) return undefined;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return undefined;
  if (/[\x00-\x1f\x7f\\]/.test(next)) return undefined;
  return next;
}

/** POST /auth/google/2fa: exchanges a ticket + TOTP (or recovery code) for a session. */
export async function completeGoogle2fa(ticket: string, code: string, req: Request): Promise<UserDoc & { loginNext?: string }> {
  const invalidTicket = () => new AppError(401, 'INVALID_TICKET', 'This sign-in step has expired. Please continue with Google again.');
  const t = await Token.findOne({ tokenHash: sha256(ticket), type: 'google_2fa', usedAt: null, expiresAt: { $gt: new Date() } });
  if (!t) throw invalidTicket();
  const burn = () => Token.updateOne({ _id: t._id }, { $set: { usedAt: new Date() } });
  if (t.attempts >= GOOGLE_2FA_MAX_ATTEMPTS) {
    await burn();
    throw invalidTicket();
  }
  const user = await User.findOne({ _id: t.userId, status: 'active' }).select('+twoFactor.secretEncrypted');
  if (!user) {
    await burn();
    throw invalidTicket();
  }
  if (user.twoFactor?.enabled) {
    if (!(await reserveLoginAttempt(user._id))) {
      await audit({ action: 'auth.login_failed', actorId: user._id, meta: { reason: 'locked', method: 'google' }, req });
      throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Too many failed attempts. Try again in 15 minutes.');
    }
    if (!(await verifySecondFactor(user, code, req))) {
      const updated = await Token.findOneAndUpdate({ _id: t._id }, { $inc: { attempts: 1 } }, { new: true });
      const attempts = updated?.attempts ?? GOOGLE_2FA_MAX_ATTEMPTS;
      if (attempts >= GOOGLE_2FA_MAX_ATTEMPTS) await burn();
      await lockIfExhausted(user._id);
      await audit({ action: 'auth.login_failed', actorId: user._id, meta: { reason: 'bad_totp', method: 'google' }, req });
      throw new AppError(401, 'INVALID_TOTP', 'The authenticator or recovery code is incorrect', {
        attemptsLeft: Math.max(0, GOOGLE_2FA_MAX_ATTEMPTS - attempts),
      });
    }
  }
  const claimed = await Token.findOneAndUpdate({ _id: t._id, usedAt: null }, { $set: { usedAt: new Date() } });
  if (!claimed) throw invalidTicket();
  if (!(await completeLogin(user))) throw invalidCredentials();
  await audit({ action: 'auth.login', actorId: user._id, meta: { method: 'google', twoFactor: true }, req });
  return Object.assign(user, t.next ? { loginNext: t.next } : {});
}

// ---------------------------------------------------------------------------------------------
// Emails (verify email / reset password / security notices)
// ---------------------------------------------------------------------------------------------

export async function sendSafely(to: string, rendered: { subject: string; html: string; text: string }) {
  try {
    await getEmail().send({ to, ...rendered });
  } catch (err) {
    logger.error({ err }, 'Failed to send email');
  }
}

/** Security notice to the account email (or `to`, e.g. the OLD address after an email change). Never throws. */
export async function notifySecurityEvent(
  user: { name: string; email?: string | null },
  event: templates.SecurityEvent,
  opts: { to?: string; newEmail?: string } = {},
): Promise<void> {
  const address = opts.to ?? user.email;
  if (!address) return;
  await sendSafely(address, templates.securityNotice(user.name, event, { newEmail: opts.newEmail }));
}

export async function sendVerificationEmail(user: UserDoc): Promise<void> {
  if (!user.email) return;
  await Token.updateMany({ userId: user._id, type: 'verify_email', usedAt: null }, { $set: { usedAt: new Date() } });
  const token = randomToken(32);
  await Token.create({
    type: 'verify_email',
    userId: user._id,
    tokenHash: sha256(token),
    email: user.email,
    expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
  });
  await sendSafely(user.email, templates.verifyEmail(user.name, token));
}

async function consumeToken(type: 'verify_email' | 'reset_password', token: string) {
  const now = new Date();
  return Token.findOneAndUpdate(
    { tokenHash: sha256(token), type, usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
    { new: true },
  );
}

export async function verifyEmailToken(token: string): Promise<void> {
  const t = await consumeToken('verify_email', token);
  const invalid = new AppError(400, 'INVALID_TOKEN', 'This link is invalid or has expired');
  if (!t) throw invalid;
  const r = await User.updateOne({ _id: t.userId, email: t.email, status: 'active' }, { $set: { emailVerified: true } });
  if (r.matchedCount === 0) throw invalid;
}

/** Invalidates every unused password-reset link of the user. */
export async function invalidateResetTokens(userId: Types.ObjectId): Promise<void> {
  await Token.updateMany({ userId, type: 'reset_password', usedAt: null }, { $set: { usedAt: new Date() } });
}

/** The route does not await this (fire-and-forget), so response time never reveals whether the email exists. */
export async function forgotPassword(email: string): Promise<void> {
  const user = await User.findOne({ email, status: 'active' });
  if (!user?.email) return; // no user enumeration
  await invalidateResetTokens(user._id);
  const token = randomToken(32);
  await Token.create({
    type: 'reset_password',
    userId: user._id,
    tokenHash: sha256(token),
    email: user.email,
    expiresAt: new Date(Date.now() + 60 * 60_000),
  });
  await sendSafely(user.email, templates.resetPassword(user.name, token));
}

export async function resetPassword(token: string, password: string, req: Request): Promise<void> {
  const t = await consumeToken('reset_password', token);
  if (!t) throw new AppError(400, 'INVALID_TOKEN', 'This reset link is invalid or has expired');
  const user = await User.findOne({ _id: t.userId, status: 'active' });
  // The link must still match the account's current address (an email change invalidates it too).
  if (!user || user.email !== t.email) throw new AppError(400, 'INVALID_TOKEN', 'This reset link is invalid or has expired');
  user.passwordHash = await hashPassword(password);
  user.passwordChangeRecommended = false;
  user.failedLoginCount = 0;
  user.lockUntil = undefined;
  await user.save();
  const revoked = await revokeAllSessions(user._id);
  await audit({ action: 'auth.password_reset', actorId: user._id, targetType: 'User', targetId: user._id, meta: { revokedSessions: revoked }, req });
}

// ---------------------------------------------------------------------------------------------
// Phone OTP
// ---------------------------------------------------------------------------------------------

const OTP_TTL_MS = 5 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
const otpHash = (purpose: OtpPurpose, phone: string, code: string) => sha256(`${purpose}:${phone}:${code}`);

const OTP_TEXT: Record<OtpPurpose, (code: string) => string> = {
  login: (c) => `Your Souqly code is ${c}. It expires in 5 minutes. Never share it.`,
  reauth: (c) => `Your Souqly security code is ${c}. Use it only to confirm a change you are making to your account. Never share it.`,
  phone_change: (c) => `Your Souqly code to verify this number is ${c}. It expires in 5 minutes. Never share it.`,
};

/**
 * Creates and sends a 6-digit OTP (only its hash is stored). The code is echoed back as `devCode`
 * only when no SMS provider is configured AND DEV_OTP_ECHO is explicitly on (rejected in production).
 */
export async function issueOtp(phone: string, purpose: OtpPurpose, userId?: Types.ObjectId): Promise<{ sent: true; devCode?: string }> {
  if (!integrations.hasTwilio && isProd) {
    throw new AppError(503, 'SMS_UNAVAILABLE', 'SMS codes are not available right now');
  }
  const code = randomDigits(6);
  await Otp.deleteMany(userId ? { userId, purpose } : { phone, purpose });
  await Otp.create({ phone, purpose, userId, codeHash: otpHash(purpose, phone, code), expiresAt: new Date(Date.now() + OTP_TTL_MS) });
  await getNotifier().sendSms(phone, OTP_TEXT[purpose](code));
  if (!integrations.hasTwilio && env.DEV_OTP_ECHO) {
    logger.info({ phone, purpose }, '[dev] OTP returned in the API response (DEV_OTP_ECHO)');
    return { sent: true, devCode: code };
  }
  return { sent: true };
}

/** Checks the latest OTP matching the filter. Counts failures (deleted after 5). Does NOT consume it. */
async function checkOtp(filter: { phone: string; purpose: OtpPurpose; userId?: Types.ObjectId }, code: string) {
  const otp = await Otp.findOne({ ...filter, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  if (!otp) throw new AppError(400, 'OTP_EXPIRED', 'The code has expired. Please request a new one.');
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await Otp.deleteOne({ _id: otp._id });
    throw new AppError(429, 'OTP_TOO_MANY_ATTEMPTS', 'Too many wrong codes. Please request a new one.');
  }
  if (!safeEqual(otp.codeHash, otpHash(filter.purpose, filter.phone, code))) {
    const updated = await Otp.findOneAndUpdate({ _id: otp._id }, { $inc: { attempts: 1 } }, { new: true });
    if (updated && updated.attempts >= OTP_MAX_ATTEMPTS) await Otp.deleteOne({ _id: otp._id });
    throw new AppError(400, 'OTP_INVALID', 'The code is incorrect', {
      attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - (updated?.attempts ?? OTP_MAX_ATTEMPTS)),
    });
  }
  return otp;
}

/** Deletes the OTP; false when a concurrent request already consumed it (single use). */
async function consumeOtp(id: Types.ObjectId): Promise<boolean> {
  return (await Otp.deleteOne({ _id: id })).deletedCount === 1;
}

/**
 * Checks a user-bound OTP (reauth / phone_change) and consumes it unless `consume: false` (first step
 * of a two-step flow such as 2FA setup → enable, so one code confirms the whole wizard).
 */
export async function verifyUserOtp(
  userId: Types.ObjectId,
  phone: string,
  purpose: 'reauth' | 'phone_change',
  code: string,
  opts: { consume?: boolean } = {},
): Promise<void> {
  const otp = await checkOtp({ phone, purpose, userId }, code);
  if (opts.consume === false) return;
  if (!(await consumeOtp(otp._id))) throw new AppError(400, 'OTP_EXPIRED', 'The code has expired. Please request a new one.');
}

export async function requestOtp(rawPhone: string): Promise<{ sent: true; devCode?: string }> {
  return issueOtp(normalizePhone(rawPhone), 'login');
}

export async function verifyOtp(
  rawPhone: string,
  code: string,
  totp: string | undefined,
  req: Request,
): Promise<{ user: UserDoc; isNew: boolean }> {
  const phone = normalizePhone(rawPhone);
  const otp = await checkOtp({ phone, purpose: 'login' }, code);

  // Only a VERIFIED phone identifies an account: an unverified number can never be used to log in.
  let user = await User.findOne({ phone, phoneVerified: true, status: { $ne: 'deleted' } }).select('+twoFactor.secretEncrypted');
  if (user?.status === 'blocked') throw new AppError(403, 'ACCOUNT_BLOCKED', 'This account has been blocked. Please contact support.');
  if (user?.twoFactor?.enabled) {
    // The OTP stays valid so the client can resend it together with the TOTP code.
    if (!totp) throw new AppError(401, 'TOTP_REQUIRED', 'Enter the 6-digit code from your authenticator app');
    if (!(await verifySecondFactor(user, totp, req))) {
      await Otp.updateOne({ _id: otp._id }, { $inc: { attempts: 1 } });
      throw new AppError(401, 'INVALID_TOTP', 'The authenticator or recovery code is incorrect');
    }
  }
  if (!(await consumeOtp(otp._id))) throw new AppError(400, 'OTP_EXPIRED', 'The code has expired. Please request a new one.');

  let isNew = false;
  if (!user) {
    // Legacy accounts holding this number UNVERIFIED lose it: whoever has the SIM owns the number.
    await User.updateMany({ phone, phoneVerified: { $ne: true } }, { $unset: { phone: 1 } });
    user = await User.create({
      name: 'Souqly Shopper',
      phone,
      phoneVerified: true,
      referralCode: await generateReferralCode(),
      lastLoginAt: new Date(),
    });
    isNew = true;
    await audit({ action: 'auth.signup', actorId: user._id, targetType: 'User', targetId: user._id, meta: { method: 'otp' }, req });
  } else {
    user.lastLoginAt = new Date();
    await user.save();
  }
  await audit({ action: 'auth.login', actorId: user._id, meta: { method: 'otp' }, req });
  return { user, isNew };
}
