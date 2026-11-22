import {
  addressSchema,
  changeEmailSchema,
  changePasswordSchema,
  deleteAccountSchema,
  objectIdSchema,
  phoneVerifySchema,
  revokeAllSessionsSchema,
  switchModeSchema,
  twoFactorDisableSchema,
  twoFactorEnableSchema,
  twoFactorSetupSchema,
  updatePreferencesSchema,
  updateProfileSchema,
} from '@souqly/shared';
import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AppError } from '../../lib/AppError';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { forbidWhileImpersonating } from '../../middleware/impersonation';
import { rateLimits } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import { User } from '../users/user.model';
import { toMeUser } from '../users/user.service';
import * as account from './account.service';

export const accountRouter = Router();
accountRouter.use(requireAuth);

const idParams = z.object({ id: objectIdSchema });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new AppError(400, 'INVALID_FILE_TYPE', 'Use a JPG, PNG or WebP image'));
  },
});

/** Phone changes send an SMS and are a credential change: rate limited and blocked while impersonating. */
const whenPhoneChanges =
  (...handlers: RequestHandler[]): RequestHandler =>
  (req, res, next) => {
    if ((req.body as { phone?: unknown } | undefined)?.phone === undefined) return next();
    const run = (i: number): void => {
      const h = handlers[i];
      if (!h) return next();
      h(req, res, (err?: unknown) => (err ? next(err) : run(i + 1)));
    };
    run(0);
  };

const me = async (userId: string, impersonatorId?: string) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Please log in to continue');
  return toMeUser(user, { impersonatorId });
};

// ---- profile ----
accountRouter.get(
  '/profile',
  asyncHandler(async (req, res) => {
    res.json({ data: { user: await me(req.user!.id, req.user!.impersonatorId) } });
  }),
);

accountRouter.patch(
  '/profile',
  validate({ body: updateProfileSchema }),
  whenPhoneChanges(forbidWhileImpersonating, rateLimits.accountOtp),
  asyncHandler(async (req, res) => {
    const { user, phoneVerification } = await account.updateProfile(req, req.body);
    res.json({
      data: { user: await toMeUser(user, { impersonatorId: req.user!.impersonatorId }), ...(phoneVerification ? { phoneVerification } : {}) },
    });
  }),
);

accountRouter.post(
  '/phone/verify',
  forbidWhileImpersonating,
  rateLimits.accountOtp,
  validate({ body: phoneVerifySchema }),
  asyncHandler(async (req, res) => {
    const user = await account.verifyPhoneChange(req, req.body.code);
    res.json({ data: { user: await toMeUser(user) } });
  }),
);

// ---- re-auth for passwordless accounts ----
accountRouter.post(
  '/reauth/otp',
  forbidWhileImpersonating,
  rateLimits.accountOtp,
  asyncHandler(async (req, res) => {
    res.json({ data: await account.requestReauthOtp(req.user!.id) });
  }),
);

accountRouter.post(
  '/avatar',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const avatarUrl = await account.updateAvatar(req.user!.id, req.file);
    res.json({ data: { avatarUrl } });
  }),
);

accountRouter.patch(
  '/preferences',
  validate({ body: updatePreferencesSchema }),
  asyncHandler(async (req, res) => {
    const user = await account.updatePreferences(req.user!.id, req.body);
    res.json({ data: { user: await toMeUser(user, { impersonatorId: req.user!.impersonatorId }) } });
  }),
);

// ---- password / email ----
accountRouter.post(
  '/change-password',
  forbidWhileImpersonating,
  validate({ body: changePasswordSchema }),
  asyncHandler(async (req, res) => {
    const revokedSessions = await account.changePassword(req, req.body.currentPassword, req.body.newPassword);
    res.json({ data: { changed: true, revokedSessions } });
  }),
);

accountRouter.post(
  '/change-email',
  forbidWhileImpersonating,
  validate({ body: changeEmailSchema }),
  asyncHandler(async (req, res) => {
    const revokedSessions = await account.changeEmail(req, req.body.newEmail, req.body.password);
    res.json({ data: { changed: true, verificationSent: true, revokedSessions } });
  }),
);

// ---- sessions ----
accountRouter.get(
  '/sessions',
  asyncHandler(async (req, res) => {
    res.json({ data: await account.listSessions(req.user!.id, req.user!.sessionId) });
  }),
);

accountRouter.post(
  '/sessions/revoke-all',
  forbidWhileImpersonating,
  validate({ body: revokeAllSessionsSchema }),
  asyncHandler(async (req, res) => {
    const revoked = await account.revokeAll(req, res, req.body.includeCurrent);
    res.json({ data: { revoked } });
  }),
);

accountRouter.delete(
  '/sessions/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await account.revokeOneSession(req, res, req.params.id!);
    res.status(204).end();
  }),
);

// ---- 2FA (re-auth required; never while impersonating) ----
accountRouter.post(
  '/2fa/setup',
  forbidWhileImpersonating,
  validate({ body: twoFactorSetupSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await account.setupTwoFactor(req, req.body) });
  }),
);

accountRouter.post(
  '/2fa/enable',
  forbidWhileImpersonating,
  validate({ body: twoFactorEnableSchema }),
  asyncHandler(async (req, res) => {
    const { recoveryCodes } = await account.enableTwoFactor(req, req.body);
    res.json({ data: { enabled: true, recoveryCodes } });
  }),
);

accountRouter.post(
  '/2fa/disable',
  forbidWhileImpersonating,
  validate({ body: twoFactorDisableSchema }),
  asyncHandler(async (req, res) => {
    await account.disableTwoFactor(req, req.body);
    res.json({ data: { enabled: false } });
  }),
);

// ---- addresses ----
accountRouter.get(
  '/addresses',
  asyncHandler(async (req, res) => {
    res.json({ data: await account.listAddresses(req.user!.id) });
  }),
);

accountRouter.post(
  '/addresses',
  validate({ body: addressSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await account.createAddress(req.user!.id, req.body) });
  }),
);

accountRouter.patch(
  '/addresses/:id',
  validate({ params: idParams, body: addressSchema.partial().strip() }),
  asyncHandler(async (req, res) => {
    // .partial() keeps zod defaults for missing keys out of the update.
    const raw = req.body as Record<string, unknown>;
    res.json({ data: await account.updateAddress(req.user!.id, req.params.id!, raw) });
  }),
);

accountRouter.delete(
  '/addresses/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await account.deleteAddress(req.user!.id, req.params.id!);
    res.status(204).end();
  }),
);

accountRouter.post(
  '/addresses/:id/default',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.json({ data: await account.makeDefaultAddress(req.user!.id, req.params.id!) });
  }),
);

// ---- mode / export / delete ----
accountRouter.post(
  '/mode',
  validate({ body: switchModeSchema }),
  asyncHandler(async (req, res) => {
    const user = await account.switchMode(req, req.body.mode);
    res.json({ data: { user: await toMeUser(user, { impersonatorId: req.user!.impersonatorId }) } });
  }),
);

accountRouter.get(
  '/export',
  asyncHandler(async (req, res) => {
    const data = await account.exportData(req.user!.id);
    res.setHeader('Content-Disposition', `attachment; filename="souqly-data-${new Date().toISOString().slice(0, 10)}.json"`);
    res.setHeader('Cache-Control', 'no-store');
    res.json(data);
  }),
);

accountRouter.delete(
  '/',
  forbidWhileImpersonating,
  validate({ body: deleteAccountSchema }),
  asyncHandler(async (req, res) => {
    await account.deleteAccount(req, res, req.body);
    res.status(204).end();
  }),
);
