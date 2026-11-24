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

/**
 * Router-level guard: every mutating request (anything but GET/HEAD/OPTIONS) is refused while an admin is
 * impersonating. Used on money routes (seller finance, billing, payout account, business/KYC details) so an
 * impersonator can look but never move or redirect a seller's money.
 */
export const forbidImpersonatedWrites: RequestHandler = (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  forbidWhileImpersonating(req, res, next);
};
