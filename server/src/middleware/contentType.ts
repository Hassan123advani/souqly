import type { RequestHandler } from 'express';
import { AppError } from '../lib/AppError';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** API paths (relative to /api/v1) that accept multipart/form-data uploads. */
export const MULTIPART_PATHS = new Set(['/account/avatar', '/seller/uploads', '/uploads/temp']);

/**
 * CSRF hardening for the cookie-authenticated API. HTML forms can only send urlencoded, multipart or
 * text/plain bodies without a CORS preflight, so mutating requests must either
 *   - carry `Content-Type: application/json` (multipart only on upload routes), or
 *   - have no body and an `X-Requested-With` header (a non-simple header → preflight).
 * Everything else is rejected with 415 before any handler runs.
 */
export const requireJsonContentType: RequestHandler = (req, _res, next) => {
  if (!MUTATING.has(req.method)) return next();
  const type = (req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
  const hasBody = Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding'] !== undefined;

  if (type === 'application/json') return next();
  if (type === 'multipart/form-data' && MULTIPART_PATHS.has(req.path)) return next();
  if (!type && !hasBody && req.headers['x-requested-with']) return next();

  next(
    new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the request as JSON (Content-Type: application/json)', {
      ...(type ? { contentType: type } : {}),
    }),
  );
};
