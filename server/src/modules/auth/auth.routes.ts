import {
  forgotPasswordSchema,
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailSchema,
} from '@souqly/shared';
import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../lib/AppError';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth, resolveAccessToken } from '../../middleware/auth';
import { rateLimits } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import { User } from '../users/user.model';
import { toMeUser } from '../users/user.service';
import * as auth from './auth.service';
import { googleRouter } from './google';
import { ACCESS_COOKIE, REFRESH_COOKIE, clearAuthCookies } from './tokens';

export const authRouter = Router();

authRouter.post(
  '/signup',
  rateLimits.login,
  validate({ body: signupSchema }),
  asyncHandler(async (req, res) => {
    const user = await auth.signup(req.body, req);
    await auth.startSession(req, res, user._id);
    res.status(201).json({ data: { user: await toMeUser(user) } });
  }),
);

authRouter.post(
  '/login',
  rateLimits.login,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const user = await auth.login(req.body, req);
    await auth.startSession(req, res, user._id);
    res.json({ data: { user: await toMeUser(user) } });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    // Works with either a valid access token or just the refresh cookie (expired access token).
    const cookies = (req.cookies ?? {}) as Record<string, string>;
    const at = await resolveAccessToken(cookies[ACCESS_COOKIE]);
    let sessionId: string | undefined;
    let userId: string | undefined;
    if (!(at instanceof AppError)) {
      sessionId = at.sessionId;
      userId = at.id;
    } else {
      const s = await auth.findSessionByRefreshToken(cookies[REFRESH_COOKIE]);
      if (s) {
        sessionId = String(s._id);
        userId = String(s.userId);
      }
    }
    if (sessionId) {
      await auth.revokeSession(sessionId);
      await audit({ action: 'auth.logout', actorId: userId, meta: { sessionId }, req });
    }
    clearAuthCookies(res);
    res.status(204).end();
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const session = await auth.rotateRefreshToken(req, res);
    const user = await User.findById(session.userId);
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Please log in to continue');
    res.json({
      data: { user: await toMeUser(user, { impersonatorId: session.impersonatorId ? String(session.impersonatorId) : undefined }) },
    });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user!.id);
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Please log in to continue');
    res.json({ data: { user: await toMeUser(user, { impersonatorId: req.user!.impersonatorId }) } });
  }),
);

authRouter.post(
  '/otp/request',
  rateLimits.otp,
  validate({ body: otpRequestSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await auth.requestOtp(req.body.phone) });
  }),
);

authRouter.post(
  '/otp/verify',
  rateLimits.otp,
  validate({ body: otpVerifySchema.extend({ totp: z.string().regex(/^\d{6}$/).optional() }) }),
  asyncHandler(async (req, res) => {
    const { user, isNew } = await auth.verifyOtp(req.body.phone, req.body.code, req.body.totp, req);
    await auth.startSession(req, res, user._id);
    res.json({ data: { user: await toMeUser(user), isNew } });
  }),
);

authRouter.post(
  '/verify-email',
  validate({ body: verifyEmailSchema }),
  asyncHandler(async (req, res) => {
    await auth.verifyEmailToken(req.body.token);
    res.json({ data: { verified: true } });
  }),
);

authRouter.post(
  '/resend-verification',
  requireAuth,
  rateLimits.passwordReset,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user!.id);
    if (!user?.email) throw new AppError(400, 'NO_EMAIL', 'Add an email address first');
    if (user.emailVerified) {
      res.json({ data: { sent: false, alreadyVerified: true } });
      return;
    }
    await auth.sendVerificationEmail(user);
    res.json({ data: { sent: true } });
  }),
);

authRouter.post(
  '/forgot-password',
  rateLimits.passwordReset,
  validate({ body: forgotPasswordSchema }),
  asyncHandler(async (req, res) => {
    await auth.forgotPassword(req.body.email);
    res.json({ data: { sent: true } });
  }),
);

authRouter.post(
  '/reset-password',
  rateLimits.passwordReset,
  validate({ body: resetPasswordSchema }),
  asyncHandler(async (req, res) => {
    await auth.resetPassword(req.body.token, req.body.password, req);
    clearAuthCookies(res);
    res.json({ data: { reset: true } });
  }),
);

authRouter.use('/google', googleRouter);
