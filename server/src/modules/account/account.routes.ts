import {
  addressSchema,
  changeEmailSchema,
  changePasswordSchema,
  deleteAccountSchema,
  objectIdSchema,
  revokeAllSessionsSchema,
  switchModeSchema,
  twoFactorDisableSchema,
  twoFactorEnableSchema,
  updatePreferencesSchema,
  updateProfileSchema,
} from '@souqly/shared';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AppError } from '../../lib/AppError';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
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
  asyncHandler(async (req, res) => {
    const user = await account.updateProfile(req.user!.id, req.body);
    res.json({ data: { user: await toMeUser(user, { impersonatorId: req.user!.impersonatorId }) } });
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
  validate({ body: changePasswordSchema }),
  asyncHandler(async (req, res) => {
    const revokedSessions = await account.changePassword(req, req.body.currentPassword, req.body.newPassword);
    res.json({ data: { changed: true, revokedSessions } });
  }),
);

accountRouter.post(
  '/change-email',
  validate({ body: changeEmailSchema }),
  asyncHandler(async (req, res) => {
    await account.changeEmail(req, req.body.newEmail, req.body.password);
    res.json({ data: { changed: true, verificationSent: true } });
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

// ---- 2FA ----
accountRouter.post(
  '/2fa/setup',
  asyncHandler(async (req, res) => {
    res.json({ data: await account.setupTwoFactor(req.user!.id) });
  }),
);

accountRouter.post(
  '/2fa/enable',
  validate({ body: twoFactorEnableSchema }),
  asyncHandler(async (req, res) => {
    await account.enableTwoFactor(req, req.body.code);
    res.json({ data: { enabled: true } });
  }),
);

accountRouter.post(
  '/2fa/disable',
  validate({ body: twoFactorDisableSchema }),
  asyncHandler(async (req, res) => {
    await account.disableTwoFactor(req, req.body.code, req.body.password);
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
  validate({ body: deleteAccountSchema }),
  asyncHandler(async (req, res) => {
    if (req.user!.impersonatorId) throw new AppError(403, 'IMPERSONATION_FORBIDDEN', 'Not allowed while impersonating');
    await account.deleteAccount(req, res, req.body.password);
    res.status(204).end();
  }),
);
