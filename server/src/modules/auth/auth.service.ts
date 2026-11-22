import type { LoginInput, SignupInput } from '@souqly/shared';
import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import otplib from 'otplib';
import { integrations, isProd, isTest } from '../../config/env';
import { AppError } from '../../lib/AppError';
import { decrypt, randomDigits, randomToken, safeEqual, sha256 } from '../../lib/crypto';
import { logger } from '../../lib/logger';
import { getEmail } from '../../services/email';
import * as templates from '../../services/email/templates';
import { getNotifier } from '../../services/notify';
import { audit } from '../audit/audit.service';
import { User, type UserDoc } from '../users/user.model';
import { generateReferralCode } from '../users/user.service';
import { Otp } from './otp.model';
import { Session, type SessionDoc } from './session.model';
import { Token } from './token.model';
import { REFRESH_COOKIE, REFRESH_TTL_MS, clearAuthCookies, setAuthCookies, signAccessToken } from './tokens';

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
// TOTP (2FA)
// ---------------------------------------------------------------------------------------------

export const authenticator = otplib.authenticator;
authenticator.options = { window: 1 };

export function checkTotp(code: string, secretEncrypted: string | undefined): boolean {
  if (!secretEncrypted) return false;
  try {
    return authenticator.check(code, decrypt(secretEncrypted));
  } catch (err) {
    logger.error({ err }, 'Could not decrypt 2FA secret');
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Phone
// ---------------------------------------------------------------------------------------------

/** Stores phones in E.164 form with a leading '+'. */
export function normalizePhone(phone: string): string {
  const p = phone.trim().replace(/[\s-]/g, '');
  return p.startsWith('+') ? p : `+${p}`;
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
  return r.modifiedCount > 0;
}

/** Revokes all active sessions of a user, optionally keeping one. Returns the count. */
export async function revokeAllSessions(userId: Types.ObjectId | string, exceptSessionId?: string): Promise<number> {
  const filter: Record<string, unknown> = { userId: new Types.ObjectId(String(userId)), revokedAt: null };
  if (exceptSessionId) filter._id = { $ne: new Types.ObjectId(exceptSessionId) };
  const r = await Session.updateMany(filter, { $set: { revokedAt: new Date() } });
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

async function registerFailedLogin(user: UserDoc): Promise<void> {
  const updated = await User.findOneAndUpdate({ _id: user._id }, { $inc: { failedLoginCount: 1 } }, { new: true })
    .select('failedLoginCount')
    .lean();
  if (updated && updated.failedLoginCount >= MAX_FAILED_LOGINS) {
    await User.updateOne({ _id: user._id }, { $set: { lockUntil: new Date(Date.now() + LOCK_MS), failedLoginCount: 0 } });
  }
}

const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');

export async function login(input: LoginInput, req: Request): Promise<UserDoc> {
  const user = await User.findOne({ email: input.email, status: { $ne: 'deleted' } }).select(
    '+passwordHash +twoFactor.secretEncrypted',
  );
  if (!user || !user.passwordHash) {
    await verifyPassword(input.password, null);
    await audit({ action: 'auth.login_failed', meta: { reason: 'unknown_account', email: input.email }, req });
    throw invalidCredentials();
  }
  if (user.lockUntil && user.lockUntil > new Date()) {
    await audit({ action: 'auth.login_failed', actorId: user._id, meta: { reason: 'locked' }, req });
    throw new AppError(423, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again in a few minutes.', {
      retryAfterSeconds: Math.ceil((user.lockUntil.getTime() - Date.now()) / 1000),
    });
  }
  if (!(await verifyPassword(input.password, user.passwordHash))) {
    await registerFailedLogin(user);
    await audit({ action: 'auth.login_failed', actorId: user._id, meta: { reason: 'bad_password' }, req });
    throw invalidCredentials();
  }
  if (user.status === 'blocked') {
    await audit({ action: 'auth.login_failed', actorId: user._id, meta: { reason: 'blocked' }, req });
    throw new AppError(403, 'ACCOUNT_BLOCKED', 'This account has been blocked. Please contact support.');
  }
  if (user.twoFactor?.enabled) {
    if (!input.totp) throw new AppError(401, 'TOTP_REQUIRED', 'Enter the 6-digit code from your authenticator app');
    if (!checkTotp(input.totp, user.twoFactor.secretEncrypted)) {
      await registerFailedLogin(user);
      await audit({ action: 'auth.login_failed', actorId: user._id, meta: { reason: 'bad_totp' }, req });
      throw new AppError(401, 'INVALID_TOTP', 'The authenticator code is incorrect');
    }
  }
  user.failedLoginCount = 0;
  user.lockUntil = undefined;
  user.lastLoginAt = new Date();
  await user.save();
  await audit({ action: 'auth.login', actorId: user._id, meta: { method: 'password' }, req });
  return user;
}

// ---------------------------------------------------------------------------------------------
// Emailed tokens (verify email / reset password)
// ---------------------------------------------------------------------------------------------

async function sendSafely(to: string, rendered: { subject: string; html: string; text: string }) {
  try {
    await getEmail().send({ to, ...rendered });
  } catch (err) {
    logger.error({ err }, 'Failed to send email');
  }
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

export async function forgotPassword(email: string): Promise<void> {
  const user = await User.findOne({ email, status: 'active' });
  if (!user?.email) return; // no user enumeration
  await Token.updateMany({ userId: user._id, type: 'reset_password', usedAt: null }, { $set: { usedAt: new Date() } });
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
  if (!user) throw new AppError(400, 'INVALID_TOKEN', 'This reset link is invalid or has expired');
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
const otpHash = (phone: string, code: string) => sha256(`${phone}:${code}`);

export async function requestOtp(rawPhone: string): Promise<{ sent: true; devCode?: string }> {
  const phone = normalizePhone(rawPhone);
  const devMode = !integrations.hasTwilio && !isProd;
  if (!integrations.hasTwilio && isProd) {
    throw new AppError(503, 'SMS_UNAVAILABLE', 'Phone login is not available right now');
  }
  const code = randomDigits(6);
  await Otp.deleteMany({ phone });
  await Otp.create({ phone, codeHash: otpHash(phone, code), expiresAt: new Date(Date.now() + OTP_TTL_MS) });
  await getNotifier().sendSms(phone, `Your Souqly code is ${code}. It expires in 5 minutes. Never share it.`);
  if (devMode) {
    logger.info({ phone }, `[dev] OTP for ${phone}: ${code}`);
    return { sent: true, devCode: code };
  }
  return { sent: true };
}

export async function verifyOtp(
  rawPhone: string,
  code: string,
  totp: string | undefined,
  req: Request,
): Promise<{ user: UserDoc; isNew: boolean }> {
  const phone = normalizePhone(rawPhone);
  const otp = await Otp.findOne({ phone, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  if (!otp) throw new AppError(400, 'OTP_EXPIRED', 'The code has expired. Please request a new one.');
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await Otp.deleteOne({ _id: otp._id });
    throw new AppError(429, 'OTP_TOO_MANY_ATTEMPTS', 'Too many wrong codes. Please request a new one.');
  }
  if (!safeEqual(otp.codeHash, otpHash(phone, code))) {
    const updated = await Otp.findOneAndUpdate({ _id: otp._id }, { $inc: { attempts: 1 } }, { new: true });
    if (updated && updated.attempts >= OTP_MAX_ATTEMPTS) await Otp.deleteOne({ _id: otp._id });
    throw new AppError(400, 'OTP_INVALID', 'The code is incorrect', {
      attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - (updated?.attempts ?? OTP_MAX_ATTEMPTS)),
    });
  }

  let user = await User.findOne({ phone, status: { $ne: 'deleted' } }).select('+twoFactor.secretEncrypted');
  if (user?.status === 'blocked') throw new AppError(403, 'ACCOUNT_BLOCKED', 'This account has been blocked. Please contact support.');
  if (user?.twoFactor?.enabled) {
    // The OTP stays valid so the client can resend it together with the TOTP code.
    if (!totp) throw new AppError(401, 'TOTP_REQUIRED', 'Enter the 6-digit code from your authenticator app');
    if (!checkTotp(totp, user.twoFactor.secretEncrypted)) {
      await Otp.updateOne({ _id: otp._id }, { $inc: { attempts: 1 } });
      throw new AppError(401, 'INVALID_TOTP', 'The authenticator code is incorrect');
    }
  }
  await Otp.deleteOne({ _id: otp._id });

  let isNew = false;
  if (!user) {
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
    user.phoneVerified = true;
    user.lastLoginAt = new Date();
    await user.save();
  }
  await audit({ action: 'auth.login', actorId: user._id, meta: { method: 'otp' }, req });
  return { user, isNew };
}
