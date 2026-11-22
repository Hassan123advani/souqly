import type { AddressInput, ReauthInput, UpdatePreferencesInput, UpdateProfileInput } from '@souqly/shared';
import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import QRCode from 'qrcode';
import { AppError, notFound } from '../../lib/AppError';
import { encrypt } from '../../lib/crypto';
import { logger } from '../../lib/logger';
import { getStorage } from '../../services/storage';
import { audit } from '../audit/audit.service';
import {
  authenticator,
  checkTotp,
  consumeTotp,
  generateRecoveryCodes,
  hashPassword,
  invalidateResetTokens,
  issueOtp,
  normalizePhone,
  notifySecurityEvent,
  revokeAllSessions,
  sendVerificationEmail,
  verifyPassword,
  verifySecondFactor,
  verifyUserOtp,
} from '../auth/auth.service';
import { Otp } from '../auth/otp.model';
import { Session } from '../auth/session.model';
import { Token } from '../auth/token.model';
import { clearAuthCookies } from '../auth/tokens';
import { Store } from '../stores/store.model';
import { User, type UserDoc } from '../users/user.model';
import { Address, type AddressDoc } from './address.model';

const MAX_ADDRESSES = 20;

async function loadUser(userId: string, select = ''): Promise<UserDoc> {
  const user = await User.findOne({ _id: userId, status: { $ne: 'deleted' } }).select(select);
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Please log in to continue');
  return user;
}

async function requirePassword(user: UserDoc, password: string | undefined) {
  if (!password || !(await verifyPassword(password, user.passwordHash))) {
    throw new AppError(400, 'INVALID_PASSWORD', 'Your current password is incorrect');
  }
}

export type ReauthMethod = 'password' | 'otp' | 'none';

/**
 * Re-authentication for sensitive actions (`user` needs `+passwordHash`):
 *  - accounts with a password must send it;
 *  - passwordless accounts with a verified phone must send `otpCode` from POST /account/reauth/otp;
 *  - Google-only accounts (no password, no phone) have no other factor to ask for -> 'none'.
 * `consumeOtp: false` checks the OTP without using it up (first step of a two-step flow).
 */
export async function requireReauth(user: UserDoc, input: ReauthInput, opts: { consumeOtp?: boolean } = {}): Promise<ReauthMethod> {
  if (user.passwordHash) {
    if (!input.password) throw new AppError(400, 'REAUTH_REQUIRED', 'Enter your current password to continue', { method: 'password' });
    await requirePassword(user, input.password);
    return 'password';
  }
  if (user.phone && user.phoneVerified) {
    if (!input.otpCode) throw new AppError(400, 'REAUTH_REQUIRED', 'Enter the code we sent to your phone', { method: 'otp' });
    await verifyUserOtp(user._id, user.phone, 'reauth', input.otpCode, { consume: opts.consumeOtp !== false });
    return 'otp';
  }
  return 'none';
}

/** POST /account/reauth/otp: sends a re-auth code to the verified phone of a passwordless account. */
export async function requestReauthOtp(userId: string) {
  const user = await loadUser(userId, '+passwordHash');
  if (user.passwordHash) throw new AppError(400, 'USE_PASSWORD', 'Confirm with your password instead');
  if (!user.phone || !user.phoneVerified) throw new AppError(400, 'NO_VERIFIED_PHONE', 'Add and verify a phone number first');
  return issueOtp(user.phone, 'reauth', user._id);
}

// ---------------------------------------------------------------------------------------------
// Profile & preferences
// ---------------------------------------------------------------------------------------------

const phoneTaken = () => new AppError(409, 'PHONE_TAKEN', 'This phone number is already used by another account');

/**
 * Name changes apply at once. A new phone is NOT set: it becomes `pendingPhone` and an OTP is sent to
 * it; POST /account/phone/verify moves it to `phone` (always verified). Needs re-auth.
 */
export async function updateProfile(
  req: Request,
  input: UpdateProfileInput,
): Promise<{ user: UserDoc; phoneVerification?: { sent: true; devCode?: string } }> {
  const user = await loadUser(req.user!.id, '+passwordHash');
  if (input.name !== undefined) user.name = input.name;
  let phoneVerification: { sent: true; devCode?: string } | undefined;
  if (input.phone !== undefined) {
    const phone = normalizePhone(input.phone);
    if (phone === user.phone && user.phoneVerified) {
      user.pendingPhone = undefined; // back to the current number: cancels a pending change
    } else {
      if (req.user!.impersonatorId) throw new AppError(403, 'IMPERSONATION_FORBIDDEN', 'This action is not allowed while impersonating a user');
      if (await User.exists({ phone, phoneVerified: true, _id: { $ne: user._id } })) throw phoneTaken();
      const reauth = await requireReauth(user, input);
      user.pendingPhone = phone;
      phoneVerification = await issueOtp(phone, 'phone_change', user._id);
      await audit({ action: 'account.phone_change_requested', targetType: 'User', targetId: user._id, meta: { reauth }, req });
    }
  }
  await user.save();
  return { user, ...(phoneVerification ? { phoneVerification } : {}) };
}

/** POST /account/phone/verify: confirms `pendingPhone` with the OTP sent to it. */
export async function verifyPhoneChange(req: Request, code: string): Promise<UserDoc> {
  const user = await loadUser(req.user!.id);
  const phone = user.pendingPhone;
  if (!phone) throw new AppError(400, 'NO_PENDING_PHONE', 'There is no phone number waiting for verification');
  await verifyUserOtp(user._id, phone, 'phone_change', code);
  if (await User.exists({ phone, phoneVerified: true, _id: { $ne: user._id } })) {
    await User.updateOne({ _id: user._id }, { $unset: { pendingPhone: 1 } });
    throw phoneTaken();
  }
  // Legacy accounts holding this number unverified lose it to the person who proved the SIM.
  await User.updateMany({ phone, phoneVerified: { $ne: true }, _id: { $ne: user._id } }, { $unset: { phone: 1 } });
  const from = user.phone;
  user.phone = phone;
  user.phoneVerified = true;
  user.pendingPhone = undefined;
  await user.save(); // the verified-phone unique index rejects a concurrent claim (409 DUPLICATE)
  await Otp.deleteMany({ userId: user._id, purpose: 'reauth' });
  await audit({ action: 'account.phone_changed', targetType: 'User', targetId: user._id, meta: { from, to: phone }, req });
  await notifySecurityEvent(user, 'phone_changed');
  return user;
}

export async function updatePreferences(userId: string, input: UpdatePreferencesInput): Promise<UserDoc> {
  // Whitelisted dotted paths only (no mass assignment).
  const set: Record<string, unknown> = {};
  if (input.language) set['preferences.language'] = input.language;
  if (input.currency) set['preferences.currency'] = input.currency;
  if (input.theme) set['preferences.theme'] = input.theme;
  for (const [k, v] of Object.entries(input.notifications ?? {})) if (typeof v === 'boolean') set[`preferences.notifications.${k}`] = v;
  for (const [k, v] of Object.entries(input.privacy ?? {})) if (typeof v === 'boolean') set[`preferences.privacy.${k}`] = v;
  const user = await User.findOneAndUpdate({ _id: userId, status: { $ne: 'deleted' } }, { $set: set }, { new: true, runValidators: true });
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Please log in to continue');
  return user;
}

const AVATAR_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Checks the file's magic bytes; the client-supplied mimetype alone is not trusted. */
export function sniffImageMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

export async function updateAvatar(userId: string, file: Express.Multer.File | undefined): Promise<string> {
  if (!file) throw new AppError(400, 'FILE_REQUIRED', 'Choose an image to upload');
  const mime = sniffImageMime(file.buffer);
  if (!mime || !AVATAR_MIME.has(mime)) throw new AppError(400, 'INVALID_FILE_TYPE', 'Use a JPG, PNG or WebP image');
  const user = await loadUser(userId);
  const stored = await getStorage().upload(file.buffer, { folder: 'avatars', filename: `avatar-${userId}`, mimetype: mime });
  const oldKey = user.avatar?.key;
  user.avatar = stored;
  await user.save();
  if (oldKey) getStorage().delete(oldKey).catch((err) => logger.warn({ err }, 'Failed to delete old avatar'));
  return stored.url;
}

// ---------------------------------------------------------------------------------------------
// Password / email
// ---------------------------------------------------------------------------------------------

export async function changePassword(req: Request, currentPassword: string, newPassword: string): Promise<number> {
  const user = await loadUser(req.user!.id, '+passwordHash');
  if (!user.passwordHash) throw new AppError(400, 'NO_PASSWORD', 'This account has no password. Use "Forgot password" to set one.');
  await requirePassword(user, currentPassword);
  user.passwordHash = await hashPassword(newPassword);
  user.passwordChangeRecommended = false;
  await user.save();
  const revoked = await revokeAllSessions(user._id, req.user!.sessionId);
  await invalidateResetTokens(user._id);
  await audit({ action: 'account.password_changed', targetType: 'User', targetId: user._id, meta: { revokedSessions: revoked }, req });
  return revoked;
}

/**
 * Immediate email change (re-verify). Also: outstanding reset links die, other sessions are revoked
 * and the OLD address gets a notice, so a hijacked session cannot quietly take the account.
 */
export async function changeEmail(req: Request, newEmail: string, password: string): Promise<number> {
  const user = await loadUser(req.user!.id, '+passwordHash');
  if (!user.passwordHash) throw new AppError(400, 'NO_PASSWORD', 'Set a password before changing your email');
  await requirePassword(user, password);
  if (newEmail === user.email) throw new AppError(400, 'SAME_EMAIL', 'This is already your email');
  if (await User.exists({ email: newEmail, _id: { $ne: user._id } })) {
    throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
  }
  const oldEmail = user.email;
  user.email = newEmail;
  user.emailVerified = false;
  await user.save();
  await invalidateResetTokens(user._id);
  const revoked = await revokeAllSessions(user._id, req.user!.sessionId);
  await sendVerificationEmail(user);
  if (oldEmail) await notifySecurityEvent(user, 'email_changed', { to: oldEmail, newEmail });
  await audit({
    action: 'account.email_changed',
    targetType: 'User',
    targetId: user._id,
    meta: { from: oldEmail, to: newEmail, revokedSessions: revoked },
    req,
  });
  return revoked;
}

// ---------------------------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------------------------

export async function listSessions(userId: string, currentSessionId: string) {
  const sessions = await Session.find({ userId: new Types.ObjectId(userId), revokedAt: null, expiresAt: { $gt: new Date() } })
    .sort({ lastUsedAt: -1 })
    .limit(100)
    .lean();
  return sessions.map((s) => ({
    id: String(s._id),
    userAgent: s.userAgent,
    ip: s.ip,
    createdAt: s.createdAt.toISOString(),
    lastUsedAt: s.lastUsedAt.toISOString(),
    current: String(s._id) === currentSessionId,
  }));
}

export async function revokeOneSession(req: Request, res: Response, sessionId: string): Promise<void> {
  const r = await Session.updateOne(
    { _id: new Types.ObjectId(sessionId), userId: new Types.ObjectId(req.user!.id), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  if (r.matchedCount === 0) throw notFound('Session');
  if (sessionId === req.user!.sessionId) clearAuthCookies(res);
  await audit({ action: 'account.sessions_revoked', targetType: 'Session', targetId: sessionId, meta: { count: 1 }, req });
}

export async function revokeAll(req: Request, res: Response, includeCurrent: boolean): Promise<number> {
  const count = await revokeAllSessions(req.user!.id, includeCurrent ? undefined : req.user!.sessionId);
  if (includeCurrent) clearAuthCookies(res);
  await audit({ action: 'account.sessions_revoked', targetType: 'User', targetId: req.user!.id, meta: { count, includeCurrent }, req });
  return count;
}

// ---------------------------------------------------------------------------------------------
// 2FA
// ---------------------------------------------------------------------------------------------

const invalidTotp = () => new AppError(400, 'INVALID_TOTP', 'The authenticator code is incorrect');

/** Step 1: re-auth, then a new pending secret + QR. With an OTP re-auth the code is kept for step 2. */
export async function setupTwoFactor(req: Request, input: ReauthInput) {
  const user = await loadUser(req.user!.id, '+passwordHash');
  if (user.twoFactor?.enabled) throw new AppError(409, 'TWO_FACTOR_ALREADY_ENABLED', 'Two-factor authentication is already on');
  await requireReauth(user, input, { consumeOtp: false });
  const secret = authenticator.generateSecret();
  await User.updateOne({ _id: user._id }, { $set: { 'twoFactor.pendingSecretEncrypted': encrypt(secret) } });
  const otpauthUrl = authenticator.keyuri(user.email || user.phone || String(user._id), 'Souqly', secret);
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 240, color: { dark: '#0E5E5A', light: '#FFFFFF' } });
  return { secret, otpauthUrl, qrDataUrl };
}

/** Step 2: authenticator code + re-auth. Returns 8 single-use recovery codes (shown ONCE). */
export async function enableTwoFactor(req: Request, input: ReauthInput & { code: string }): Promise<{ recoveryCodes: string[] }> {
  const user = await loadUser(req.user!.id, '+passwordHash +twoFactor.pendingSecretEncrypted');
  if (user.twoFactor?.enabled) throw new AppError(409, 'TWO_FACTOR_ALREADY_ENABLED', 'Two-factor authentication is already on');
  const pending = user.twoFactor?.pendingSecretEncrypted;
  if (!pending) throw new AppError(400, 'TWO_FACTOR_NOT_SETUP', 'Start the two-factor setup first');
  // Check the code first so a typo does not burn the re-auth OTP.
  if (!checkTotp(input.code, pending)) throw invalidTotp();
  const reauth = await requireReauth(user, input);
  if (!(await consumeTotp(user._id, input.code, pending))) throw invalidTotp();
  const { codes, stored } = generateRecoveryCodes();
  await User.updateOne(
    { _id: user._id },
    {
      $set: { 'twoFactor.enabled': true, 'twoFactor.secretEncrypted': pending, 'twoFactor.recoveryCodes': stored },
      $unset: { 'twoFactor.pendingSecretEncrypted': 1 },
    },
  );
  await audit({ action: 'account.2fa_enabled', targetType: 'User', targetId: user._id, meta: { reauth }, req });
  await notifySecurityEvent(user, 'two_factor_enabled');
  return { recoveryCodes: codes };
}

/** Needs re-auth AND an authenticator or recovery code. */
export async function disableTwoFactor(req: Request, input: ReauthInput & { code: string }): Promise<void> {
  const user = await loadUser(req.user!.id, '+passwordHash +twoFactor.secretEncrypted');
  if (!user.twoFactor?.enabled) throw new AppError(409, 'TWO_FACTOR_NOT_ENABLED', 'Two-factor authentication is off');
  const reauth = await requireReauth(user, input);
  if (!(await verifySecondFactor(user, input.code, req))) {
    throw new AppError(400, 'INVALID_TOTP', 'The authenticator or recovery code is incorrect');
  }
  await User.updateOne(
    { _id: user._id },
    {
      $set: { 'twoFactor.enabled': false },
      $unset: { 'twoFactor.secretEncrypted': 1, 'twoFactor.pendingSecretEncrypted': 1, 'twoFactor.recoveryCodes': 1 },
    },
  );
  await audit({ action: 'account.2fa_disabled', targetType: 'User', targetId: user._id, meta: { reauth }, req });
  await notifySecurityEvent(user, 'two_factor_disabled');
}

// ---------------------------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------------------------

export function toAddressDto(a: AddressDoc | (Record<string, unknown> & { _id: Types.ObjectId })) {
  const o = ('toObject' in a && typeof a.toObject === 'function' ? a.toObject() : a) as Record<string, unknown> & { _id: Types.ObjectId };
  return {
    id: String(o._id),
    label: o.label,
    fullName: o.fullName,
    phone: o.phone,
    country: o.country,
    city: o.city,
    ...(o.area ? { area: o.area } : {}),
    line1: o.line1,
    ...(o.line2 ? { line2: o.line2 } : {}),
    ...(o.postalCode ? { postalCode: o.postalCode } : {}),
    ...(o.location ? { location: o.location } : {}),
    isDefault: !!o.isDefault,
  };
}

const ADDRESS_FIELDS = ['label', 'fullName', 'phone', 'country', 'city', 'area', 'line1', 'line2', 'postalCode', 'location'] as const;

function pickAddress(input: Partial<AddressInput>): Partial<AddressInput> {
  const out: Record<string, unknown> = {};
  for (const k of ADDRESS_FIELDS) if (input[k] !== undefined) out[k] = input[k];
  return out as Partial<AddressInput>;
}

export async function listAddresses(userId: string) {
  const items = await Address.find({ userId: new Types.ObjectId(userId) }).sort({ isDefault: -1, createdAt: -1 }).limit(MAX_ADDRESSES);
  return items.map(toAddressDto);
}

async function setDefault(userId: Types.ObjectId, addressId: Types.ObjectId) {
  await Address.updateMany({ userId, _id: { $ne: addressId }, isDefault: true }, { $set: { isDefault: false } });
  await Address.updateOne({ userId, _id: addressId }, { $set: { isDefault: true } });
}

export async function createAddress(userId: string, input: AddressInput) {
  const uid = new Types.ObjectId(userId);
  const count = await Address.countDocuments({ userId: uid });
  if (count >= MAX_ADDRESSES) throw new AppError(400, 'ADDRESS_LIMIT', `You can save up to ${MAX_ADDRESSES} addresses`);
  const address = await Address.create({ ...pickAddress(input), userId: uid, isDefault: false });
  if (input.isDefault || count === 0) await setDefault(uid, address._id);
  return toAddressDto((await Address.findById(address._id))!);
}

export async function updateAddress(userId: string, id: string, input: Partial<AddressInput>) {
  const uid = new Types.ObjectId(userId);
  const address = await Address.findOneAndUpdate({ _id: id, userId: uid }, { $set: pickAddress(input) }, { new: true, runValidators: true });
  if (!address) throw notFound('Address');
  if (input.isDefault === true) await setDefault(uid, address._id);
  return toAddressDto((await Address.findById(address._id))!);
}

export async function deleteAddress(userId: string, id: string): Promise<void> {
  const uid = new Types.ObjectId(userId);
  const address = await Address.findOneAndDelete({ _id: id, userId: uid });
  if (!address) throw notFound('Address');
  if (address.isDefault) {
    const next = await Address.findOne({ userId: uid }).sort({ createdAt: -1 });
    if (next) await setDefault(uid, next._id);
  }
}

export async function makeDefaultAddress(userId: string, id: string) {
  const uid = new Types.ObjectId(userId);
  const address = await Address.findOne({ _id: id, userId: uid });
  if (!address) throw notFound('Address');
  await setDefault(uid, address._id);
  return toAddressDto((await Address.findById(address._id))!);
}

// ---------------------------------------------------------------------------------------------
// Mode / export / delete
// ---------------------------------------------------------------------------------------------

export async function switchMode(req: Request, mode: 'buyer' | 'seller'): Promise<UserDoc> {
  const user = await loadUser(req.user!.id);
  if (mode === 'seller' && !user.isSeller) {
    throw new AppError(409, 'NEEDS_STORE', 'Create your store to start selling');
  }
  if (user.activeMode !== mode) {
    const from = user.activeMode;
    user.activeMode = mode;
    await user.save();
    await audit({ action: 'account.mode_switched', targetType: 'User', targetId: user._id, meta: { from, to: mode }, req });
  }
  return user;
}

export async function exportData(userId: string) {
  const uid = new Types.ObjectId(userId);
  const [user, addresses, sessions] = await Promise.all([
    User.findById(uid).lean(),
    Address.find({ userId: uid }).lean(),
    Session.find({ userId: uid, revokedAt: null }).select('userAgent ip createdAt lastUsedAt').lean(),
  ]);
  if (!user) throw notFound('User');
  return {
    exportedAt: new Date().toISOString(),
    profile: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      phone: user.phone,
      ...(user.pendingPhone ? { pendingPhone: user.pendingPhone } : {}),
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      activeMode: user.activeMode,
      isSeller: user.isSeller,
      preferences: user.preferences,
      referralCode: user.referralCode,
      coins: user.coins,
      walletBalance: user.walletBalance,
      twoFactorEnabled: !!user.twoFactor?.enabled,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    },
    addresses: addresses.map((a) => toAddressDto(a as unknown as Record<string, unknown> & { _id: Types.ObjectId })),
    sessions: sessions.map((s) => ({ userAgent: s.userAgent, ip: s.ip, createdAt: s.createdAt, lastUsedAt: s.lastUsedAt })),
  };
}

export async function deleteAccount(req: Request, res: Response, input: ReauthInput): Promise<void> {
  const user = await loadUser(req.user!.id, '+passwordHash');
  const reauth = await requireReauth(user, input);
  if (await Store.exists({ ownerId: user._id, status: { $in: ['pending', 'approved', 'suspended'] } })) {
    throw new AppError(409, 'OWNS_STORE', 'Close or transfer your store before deleting your account');
  }
  const avatarKey = user.avatar?.key;
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        name: 'Deleted user',
        status: 'deleted',
        deletedAt: new Date(),
        emailVerified: false,
        phoneVerified: false,
        activeMode: 'buyer',
        'twoFactor.enabled': false,
        'preferences.notifications.marketing': false,
      },
      $unset: {
        email: 1,
        phone: 1,
        pendingPhone: 1,
        passwordHash: 1,
        googleId: 1,
        avatar: 1,
        'twoFactor.secretEncrypted': 1,
        'twoFactor.pendingSecretEncrypted': 1,
        'twoFactor.recoveryCodes': 1,
      },
    },
  );
  await Address.deleteMany({ userId: user._id });
  await Token.deleteMany({ userId: user._id });
  await Otp.deleteMany({ userId: user._id });
  await revokeAllSessions(user._id);
  if (avatarKey) getStorage().delete(avatarKey).catch((err) => logger.warn({ err }, 'Failed to delete avatar'));
  clearAuthCookies(res);
  await audit({ action: 'account.deleted', targetType: 'User', targetId: user._id, meta: { reauth }, req });
}
