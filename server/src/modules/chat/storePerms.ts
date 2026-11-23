import type { Permission } from '@souqly/shared';
import type { RequestHandler } from 'express';
import { AppError } from '../../lib/AppError';

/** Passes when the current store membership has ANY of the given `store.*` permissions (after storeContext). */
export function requireAnyStorePermission(...perms: Permission[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new AppError(401, 'UNAUTHENTICATED', 'Please log in to continue'));
    if (!perms.some((p) => req.storePermissions?.includes(p))) return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to do that'));
    next();
  };
}
