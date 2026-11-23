import { ADMIN_PERMISSIONS, PERMISSIONS, PLATFORM_ROLES, PLATFORM_ROLE_PERMISSIONS, type Permission, adminAuditQuerySchema, adminStaffInviteSchema, objectIdSchema } from '@souqly/shared';
import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { env, integrations } from '../../config/env';
import { isInMemoryDb } from '../../config/db';
import { AppError } from '../../lib/AppError';
import { asyncHandler } from '../../lib/asyncHandler';
import { streamCsv } from '../../lib/csv';
import { recentErrors } from '../../lib/errorRing';
import { logger } from '../../lib/logger';
import { cursorFilter, cursorSort, paginate } from '../../lib/pagination';
import { escapeRegex } from '../../lib/text';
import { validate } from '../../middleware/validate';
import { getEmail } from '../../services/email';
import { getJobs } from '../../services/jobs';
import { AuditLog } from '../audit/auditLog.model';
import { User } from '../users/user.model';
import { can, iso, q } from './common';
import { setPlatformRole } from './users.routes';

export const adminPlatformRouter = Router();
const idParams = z.object({ id: objectIdSchema });

// ---------------- staff ----------------
/**
 * Staff who hold `permission` (e.g. ticket assignment: admin.support.manage). Available to support
 * managers, who cannot list all staff. Returns names only (no emails / security fields).
 */
adminPlatformRouter.get(
  '/staff/assignable',
  ...can(PERMISSIONS.ADMIN_SUPPORT_MANAGE),
  validate({ query: z.object({ permission: z.enum(ADMIN_PERMISSIONS as [Permission, ...Permission[]]).default(PERMISSIONS.ADMIN_SUPPORT_MANAGE) }) }),
  asyncHandler(async (req, res) => {
    const perm = req.query.permission as Permission;
    const roles = PLATFORM_ROLES.filter((r) => PLATFORM_ROLE_PERMISSIONS[r].includes(perm));
    const rows = await User.find({ platformRole: { $in: roles }, status: 'active' }).select('name platformRole').sort({ name: 1 }).limit(500).lean();
    res.json({ data: rows.map((u) => ({ id: String(u._id), name: u.name, platformRole: u.platformRole })) });
  }),
);

adminPlatformRouter.get(
  '/staff',
  ...can(PERMISSIONS.ADMIN_STAFF_MANAGE),
  asyncHandler(async (_req, res) => {
    const rows = await User.find({ platformRole: { $exists: true }, status: { $ne: 'deleted' } }).select('name email platformRole status lastLoginAt createdAt twoFactor.enabled').sort({ createdAt: 1 }).lean();
    res.json({
      data: rows.map((u) => ({ id: String(u._id), name: u.name, email: u.email ?? null, platformRole: u.platformRole, status: u.status, twoFactorEnabled: !!u.twoFactor?.enabled, lastLoginAt: iso(u.lastLoginAt), createdAt: iso(u.createdAt) })),
    });
  }),
);

/** Grants a platform role to an existing account (the person signs up first; no password is ever emailed). */
adminPlatformRouter.post(
  '/staff',
  ...can(PERMISSIONS.ADMIN_STAFF_MANAGE),
  validate({ body: adminStaffInviteSchema }),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email, status: 'active' }).select('_id name email').lean();
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'No active account uses this email. Ask them to sign up first.');
    const out = await setPlatformRole(req, String(user._id), req.body.platformRole);
    getEmail()
      .send({ to: user.email!, subject: 'You were added to the Souqly team', text: `Hi ${user.name}, you now have the ${req.body.platformRole} role on Souqly. Open ${env.CLIENT_URL}/admin`, html: `<p>Hi, you now have the <strong>${req.body.platformRole}</strong> role on Souqly.</p>` })
      .catch((err) => logger.warn({ err }, 'staff invite email failed'));
    res.status(201).json({ data: out });
  }),
);

adminPlatformRouter.delete(
  '/staff/:id',
  ...can(PERMISSIONS.ADMIN_STAFF_MANAGE),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user!.id) throw new AppError(400, 'CANNOT_REMOVE_SELF', 'You cannot remove your own staff role');
    res.json({ data: await setPlatformRole(req, req.params.id!, null) });
  }),
);

// ---------------- audit logs ----------------
type AuditQuery = z.infer<typeof adminAuditQuerySchema>;
function auditFilter(f: AuditQuery): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (f.actorId) filter.actorId = new mongoose.Types.ObjectId(f.actorId);
  if (f.action) filter.action = { $regex: `^${escapeRegex(f.action)}` };
  if (f.targetType) filter.targetType = f.targetType;
  if (f.targetId) filter.targetId = f.targetId;
  if (f.from || f.to) filter.createdAt = { ...(f.from ? { $gte: f.from } : {}), ...(f.to ? { $lte: f.to } : {}) };
  return filter;
}
type AuditRow = { _id: mongoose.Types.ObjectId; action: string; actorId?: unknown; actorRole?: string; targetType?: string; targetId?: string; storeId?: unknown; ip?: string; meta?: Record<string, unknown>; createdAt: Date };
const auditDTO = (a: AuditRow) => ({
  id: String(a._id),
  action: a.action,
  actorId: a.actorId ? String(a.actorId) : null,
  actorRole: a.actorRole ?? null,
  targetType: a.targetType ?? null,
  targetId: a.targetId ?? null,
  storeId: a.storeId ? String(a.storeId) : null,
  ip: a.ip ?? null,
  meta: a.meta ?? {},
  createdAt: iso(a.createdAt),
});

adminPlatformRouter.get(
  '/audit-logs',
  ...can(PERMISSIONS.ADMIN_AUDIT_VIEW),
  validate({ query: adminAuditQuerySchema }),
  asyncHandler(async (req, res) => {
    const f = q<AuditQuery>(req);
    if (f.format === 'csv') {
      const cursor = AuditLog.find(auditFilter(f)).sort({ _id: -1 }).limit(100_000).lean<AuditRow[]>().cursor() as AsyncIterable<AuditRow>;
      return streamCsv(res, 'audit-logs.csv', [
        { header: 'at', value: (a: AuditRow) => a.createdAt },
        { header: 'action', value: (a) => a.action },
        { header: 'actorId', value: (a) => (a.actorId ? String(a.actorId) : '') },
        { header: 'actorRole', value: (a) => a.actorRole },
        { header: 'targetType', value: (a) => a.targetType },
        { header: 'targetId', value: (a) => a.targetId },
        { header: 'ip', value: (a) => a.ip },
        { header: 'meta', value: (a) => a.meta },
      ], cursor);
    }
    const rows = await AuditLog.find({ ...auditFilter(f), ...cursorFilter('_id', -1, f.cursor) }).sort(cursorSort('_id', -1)).limit(f.limit + 1).lean<AuditRow[]>();
    const page = paginate(rows, f.limit, '_id');
    res.json({ data: page.items.map(auditDTO), meta: { nextCursor: page.nextCursor } });
  }),
);

// ---------------- system health ----------------
adminPlatformRouter.get(
  '/system/health',
  ...can(PERMISSIONS.ADMIN_SYSTEM_VIEW),
  asyncHandler(async (_req, res) => {
    const connected = mongoose.connection.readyState === 1;
    const collections: Record<string, number> = {};
    if (connected) {
      for (const [name, model] of Object.entries(mongoose.models)) {
        collections[name] = await model.estimatedDocumentCount().catch(() => -1);
      }
    }
    const mem = process.memoryUsage();
    const { hasMongo: _m, ...keys } = integrations;
    void _m;
    res.json({
      data: {
        uptimeSeconds: Math.round(process.uptime()),
        node: process.version,
        memory: { rssMb: Math.round(mem.rss / 1e6), heapUsedMb: Math.round(mem.heapUsed / 1e6), heapTotalMb: Math.round(mem.heapTotal / 1e6) },
        db: { status: connected ? 'connected' : 'disconnected', inMemory: isInMemoryDb(), collections },
        // Booleans only: which integration keys are present (never the keys themselves).
        integrations: keys,
        jobs: getJobs().stats(),
        recentErrors: recentErrors(),
      },
    });
  }),
);
