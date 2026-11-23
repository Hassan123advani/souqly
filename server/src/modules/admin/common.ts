import type { Permission } from '@souqly/shared';
import type { Request, RequestHandler } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../../lib/AppError';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/permissions';

/** requireAuth + requirePermission(admin perm). Impersonated sessions never reach admin routes. */
export function can(perm: Permission): RequestHandler[] {
  const noImpersonation: RequestHandler = (req, _res, next) =>
    next(req.user?.impersonatorId ? new AppError(403, 'IMPERSONATION_FORBIDDEN', 'Stop impersonating to use the admin panel') : undefined);
  return [requireAuth, noImpersonation, requirePermission(perm)];
}

export const oid = (s: string | Types.ObjectId) => new Types.ObjectId(String(s));

export type ListQuery = { cursor?: string; limit: number; format: 'json' | 'csv' };
export const q = <T>(req: Request) => req.query as unknown as T;

/** Date range with defaults: last 30 days. `to` is inclusive of its day when given as a date. */
export function range(from?: Date, to?: Date, days = 30): { from: Date; to: Date } {
  const end = to ?? new Date();
  const start = from ?? new Date(end.getTime() - days * 86_400_000);
  if (start > end) throw new AppError(400, 'INVALID_RANGE', '`from` must be before `to`');
  if (end.getTime() - start.getTime() > 366 * 86_400_000) throw new AppError(400, 'RANGE_TOO_LARGE', 'Pick a range of at most one year');
  return { from: start, to: end };
}

export const iso = (d?: Date | null) => (d ? d.toISOString() : null);

/**
 * Admin list sort → (field, direction) for cursor pagination. `newest`/`oldest` use _id; the metric
 * sort uses a field that always exists (numeric, default 0) with _id as the tie-breaker.
 */
export function listSort(sort: string | undefined, metric: { key: string; field: string }, fallback: 'newest' | 'oldest' = 'newest'): { field: string; dir: 1 | -1 } {
  const s = sort ?? fallback;
  if (s === metric.key) return { field: metric.field, dir: -1 };
  return { field: '_id', dir: s === 'oldest' ? 1 : -1 };
}
