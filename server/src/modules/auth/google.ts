import { Router, type Request, type Response } from 'express';
import { Types } from 'mongoose';
import { env, integrations } from '../../config/env';
import { asyncHandler } from '../../lib/asyncHandler';
import { randomToken, safeEqual } from '../../lib/crypto';
import { logger } from '../../lib/logger';
import { audit } from '../audit/audit.service';
import { User, type UserDoc } from '../users/user.model';
import { generateReferralCode } from '../users/user.service';
import { issueGoogle2faTicket, revokeAllSessions, startSession } from './auth.service';
import { Otp } from './otp.model';
import { Token } from './token.model';

const STATE_COOKIE = 'sq_oauth_state';
const CALLBACK_PATH = '/api/v1/auth/google/callback';

type GoogleIdToken = { iss: string; aud: string; sub: string; email?: string; email_verified?: boolean; name?: string; exp: number };
export type GoogleProfile = { sub: string; email: string; name?: string };

/**
 * An existing account whose email was never verified may have been registered by someone else
 * (squatting the victim's address). Before Google links it, everything that party could still use is
 * wiped: password, 2FA, phone, sessions and outstanding tokens/OTPs.
 */
async function resetUntrustedAccount(user: UserDoc, req: Request): Promise<void> {
  const now = new Date();
  await User.updateOne(
    { _id: user._id },
    {
      $set: { 'twoFactor.enabled': false, phoneVerified: false, failedLoginCount: 0 },
      $unset: {
        passwordHash: 1,
        phone: 1,
        pendingPhone: 1,
        lockUntil: 1,
        'twoFactor.secretEncrypted': 1,
        'twoFactor.pendingSecretEncrypted': 1,
        'twoFactor.recoveryCodes': 1,
        'twoFactor.lastStep': 1,
      },
    },
  );
  const revokedSessions = await revokeAllSessions(user._id);
  await Token.updateMany({ userId: user._id, usedAt: null }, { $set: { usedAt: now } });
  await Otp.deleteMany({ userId: user._id });
  await audit({
    action: 'auth.google_link_reset',
    actorId: user._id,
    targetType: 'User',
    targetId: user._id,
    meta: { revokedSessions, hadPassword: !!user.passwordHash, hadTwoFactor: !!user.twoFactor?.enabled },
    req,
  });
  logger.warn({ userId: String(user._id) }, 'Google login linked to an unverified account; account credentials were reset');
}

/**
 * Resolves the Google profile to a user (link / create) and returns where to redirect the browser.
 * With 2FA on, NO session is created: the client gets `/login?google2fa=<ticket>` and must call
 * POST /auth/google/2fa with the ticket and a TOTP / recovery code.
 */
export async function handleGoogleProfile(req: Request, res: Response, profile: GoogleProfile): Promise<string> {
  const fail = (reason: string) => `${env.CLIENT_URL}/login?error=${encodeURIComponent(reason)}`;
  const email = profile.email.toLowerCase();

  let user = await User.findOne({ googleId: profile.sub, status: { $ne: 'deleted' } });
  if (!user) {
    const existing = await User.findOne({ email, status: { $ne: 'deleted' } }).select('+passwordHash');
    if (existing) {
      if (existing.status === 'blocked') return fail('blocked');
      if (existing.emailVerified !== true) await resetUntrustedAccount(existing, req);
      await User.updateOne({ _id: existing._id }, { $set: { googleId: profile.sub, emailVerified: true } });
      await audit({ action: 'auth.google_linked', actorId: existing._id, targetType: 'User', targetId: existing._id, req });
      user = await User.findById(existing._id);
      if (!user) return fail('google_profile');
    } else {
      user = await User.create({
        name: (profile.name ?? email.split('@')[0] ?? 'Souqly Shopper').slice(0, 80),
        email,
        emailVerified: true,
        googleId: profile.sub,
        referralCode: await generateReferralCode(),
      });
    }
  }
  if (user.status === 'blocked') return fail('blocked');

  if (user.twoFactor?.enabled) {
    const ticket = await issueGoogle2faTicket(user._id as Types.ObjectId);
    await audit({ action: 'auth.google_2fa_challenge', actorId: user._id, req });
    return `${env.CLIENT_URL}/login?google2fa=${encodeURIComponent(ticket)}`;
  }
  user.lastLoginAt = new Date();
  await user.save();
  await startSession(req, res, user._id);
  await audit({ action: 'auth.login', actorId: user._id, meta: { method: 'google' }, req });
  return env.CLIENT_URL;
}

/** Google OAuth (authorization code flow). Routes return 404 unless GOOGLE_CLIENT_ID/SECRET are set. */
export const googleRouter = Router();

googleRouter.use((_req, res, next) => {
  if (!integrations.hasGoogleAuth) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Google login is not enabled' } });
    return;
  }
  next();
});

googleRouter.get('/', (_req, res) => {
  const state = randomToken(16);
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.COOKIE_SECURE,
    path: CALLBACK_PATH,
    maxAge: 10 * 60_000,
  });
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${env.SERVER_URL}${CALLBACK_PATH}`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

googleRouter.get(
  '/callback',
  asyncHandler(async (req, res) => {
    const fail = (reason: string) => res.redirect(`${env.CLIENT_URL}/login?error=${encodeURIComponent(reason)}`);
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const expected = (req.cookies as Record<string, string>)[STATE_COOKIE] ?? '';
    res.clearCookie(STATE_COOKIE, { path: CALLBACK_PATH });
    if (!state || !code || !expected || !safeEqual(state, expected)) return fail('google_state');

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${env.SERVER_URL}${CALLBACK_PATH}`,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenRes.ok) {
      logger.warn({ status: tokenRes.status }, 'Google token exchange failed');
      return fail('google_exchange');
    }
    const { id_token: idToken } = (await tokenRes.json()) as { id_token?: string };
    // The id_token came straight from Google over TLS, so its payload can be trusted without re-verifying the signature.
    const payload = idToken
      ? (JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as GoogleIdToken)
      : undefined;
    if (
      !payload ||
      payload.aud !== env.GOOGLE_CLIENT_ID ||
      !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss) ||
      payload.exp * 1000 < Date.now() ||
      !payload.email ||
      !payload.email_verified
    ) {
      return fail('google_profile');
    }
    res.redirect(await handleGoogleProfile(req, res, { sub: payload.sub, email: payload.email, name: payload.name }));
  }),
);
