import type { Permission } from '@souqly/shared';
import type { RequestHandler } from 'express';
import { AppError } from '../lib/AppError';

/**
 * `admin.*` permissions are checked against the platform role; `store.*` permissions against
 * req.storePermissions (so `storeContext` must run first for store permissions).
 */
export function requirePermission(perm: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new AppError(401, 'UNAUTHENTICATED', 'Please log in to continue'));
    const granted = perm.startsWith('store.') ? req.storePermissions : req.user.permissions;
    if (!granted?.includes(perm)) return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to do that'));
    next();
  };
}

/** Any Souqly staff member (SUPER_ADMIN, ADMIN, SUPPORT, MODERATOR, FINANCE). */
export const requirePlatformStaff: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(new AppError(401, 'UNAUTHENTICATED', 'Please log in to continue'));
  if (!req.user.platformRole) return next(new AppError(403, 'FORBIDDEN', 'Staff access only'));
  next();
};

export const requireAdmin = requirePlatformStaff;
