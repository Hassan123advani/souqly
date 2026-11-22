import { PLATFORM_ROLE_PERMISSIONS } from '@souqly/shared';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../lib/AppError';
import { Session } from '../modules/auth/session.model';
import { ACCESS_COOKIE, verifyAccessToken } from '../modules/auth/tokens';
import { User } from '../modules/users/user.model';
import type { AuthUser } from '../types/express';

/**
 * Resolves the authenticated user from an access token: verifies the JWT, then checks that
 * the session is not revoked/expired and the user is active. Returns an AppError on failure.
 */
export async function resolveAccessToken(token: string | undefined): Promise<AuthUser | AppError> {
  if (!token) return new AppError(401, 'UNAUTHENTICATED', 'Please log in to continue');
  const result = verifyAccessToken(token);
  if (!result.ok) {
    return result.reason === 'expired'
      ? new AppError(401, 'TOKEN_EXPIRED', 'Your session has expired')
      : new AppError(401, 'UNAUTHENTICATED', 'Please log in to continue');
  }
  const { sub, sid, imp } = result.payload;
  if (!Types.ObjectId.isValid(sub) || !Types.ObjectId.isValid(sid)) {
    return new AppError(401, 'UNAUTHENTICATED', 'Please log in to continue');
  }
  const [session, user] = await Promise.all([
    Session.findById(sid).select('userId revokedAt replacedBy expiresAt impersonatorId').lean(),
    User.findById(sub).select('status platformRole').lean(),
  ]);
  if (session?.revokedAt && session.replacedBy) {
    // Rotated by a refresh: the browser already holds (or can get) a newer token.
    return new AppError(401, 'TOKEN_EXPIRED', 'Your session has expired');
  }
  if (!session|| session.revokedAt || session.expiresAt <= new Date() || String(session.userId) !== sub) {
    return new AppError(401, 'SESSION_REVOKED', 'Your session has ended. Please log in again.');
  }
  if (!user || user.status === 'deleted') return new AppError(401, 'UNAUTHENTICATED', 'Please log in to continue');
  if (user.status === 'blocked') return new AppError(403, 'ACCOUNT_BLOCKED', 'This account has been blocked');

  const platformRole = user.platformRole ?? undefined;
  return {
    id: sub,
    platformRole,
    permissions: platformRole ? [...PLATFORM_ROLE_PERMISSIONS[platformRole]] : [],
    sessionId: sid,
    impersonatorId: imp ?? (session.impersonatorId ? String(session.impersonatorId) : undefined),
  };
}

function readToken(req: Request): string | undefined {
  const c = (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];
  return typeof c === 'string' && c.length > 0 ? c : undefined;
}

export const requireAuth: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  resolveAccessToken(readToken(req))
    .then((r) => {
      if (r instanceof AppError) return next(r);
      req.user = r;
      next();
    })
    .catch(next);
};

/** Attaches req.user when a valid session exists; otherwise continues anonymously. */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const token = readToken(req);
  if (!token) return next();
  resolveAccessToken(token)
    .then((r) => {
      if (!(r instanceof AppError)) req.user = r;
      next();
    })
    .catch(next);
};
