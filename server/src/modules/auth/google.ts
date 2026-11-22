import { Router } from 'express';
import { env, integrations } from '../../config/env';
import { asyncHandler } from '../../lib/asyncHandler';
import { randomToken, safeEqual } from '../../lib/crypto';
import { logger } from '../../lib/logger';
import { audit } from '../audit/audit.service';
import { User } from '../users/user.model';
import { generateReferralCode } from '../users/user.service';
import { startSession } from './auth.service';

const STATE_COOKIE = 'sq_oauth_state';
const CALLBACK_PATH = '/api/v1/auth/google/callback';

type GoogleIdToken = { iss: string; aud: string; sub: string; email?: string; email_verified?: boolean; name?: string; exp: number };

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
    const email = payload.email.toLowerCase();

    let user = await User.findOne({ googleId: payload.sub, status: { $ne: 'deleted' } });
    if (!user) {
      user = await User.findOne({ email, status: { $ne: 'deleted' } });
      if (user) {
        user.googleId = payload.sub;
        user.emailVerified = true;
      } else {
        user = new User({
          name: (payload.name ?? email.split('@')[0] ?? 'Souqly Shopper').slice(0, 80),
          email,
          emailVerified: true,
          googleId: payload.sub,
          referralCode: await generateReferralCode(),
        });
      }
    }
    if (user.status === 'blocked') return fail('blocked');
    user.lastLoginAt = new Date();
    await user.save();
    await startSession(req, res, user._id);
    await audit({ action: 'auth.login', actorId: user._id, meta: { method: 'google' }, req });
    res.redirect(env.CLIENT_URL);
  }),
);
