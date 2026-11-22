import type { RequestHandler } from 'express';
import { AppError } from '../lib/AppError';

/**
 * Blocks credential / security changes while an admin is impersonating the user (password, email,
 * phone, 2FA, revoke-all sessions, account deletion). Must run after requireAuth.
 */
export const forbidWhileImpersonating: RequestHandler = (req, _res, next) => {
  if (req.user?.impersonatorId) {
    next(new AppError(403, 'IMPERSONATION_FORBIDDEN', 'This action is not allowed while impersonating a user'));
    return;
  }
  next();
};
