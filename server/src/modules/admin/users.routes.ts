import { PERMISSIONS, adminReasonSchema, adminSetRoleSchema, adminUserListQuerySchema, adminWalletAdjustSchema, objectIdSchema } from '@souqly/shared';
import { Router, type Request } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError, notFound } from '../../lib/AppError';
import { asyncHandler } from '../../lib/asyncHandler';
import { streamCsv } from '../../lib/csv';
import { cursorFilter, cursorSort, paginate } from '../../lib/pagination';
import { escapeRegex } from '../../lib/text';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import { revokeAllSessions, startSession } from '../auth/auth.service';
import { Session } from '../auth/session.model';
import { Order } from '../orders/order.model';
import { Store } from '../stores/store.model';
import { StoreMember } from '../stores/storeMember.model';
import { User } from '../users/user.model';
import { credit, debit } from '../wallet/wallet.service';
import { can, iso, oid, q } from './common';

export const adminUsersRouter = Router();
const idParams = z.object({ id: objectIdSchema });
/** Impersonated sessions are short-lived. */
export const IMPERSONATION_TTL_MS = 60 * 60_000;

type UserListQuery = z.infer<typeof adminUserListQuerySchema>;

function userFilter(f: UserListQuery): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (f.q) {
    const rx = { $regex: escapeRegex(f.q), $options: 'i' };
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }
  if (f.role === 'none') filter.platformRole = { $exists: false };
  else if (f.role) filter.platformRole = f.role;
  if (f.status) filter.status = f.status;
  if (f.seller !== undefined) filter.isSeller = f.seller;
  return filter;
}

type UserRow = { _id: unknown; name: string; email?: string; phone?: string; status: string; platformRole?: string; isSeller: boolean; walletBalance: number; coins: number; createdAt: Date; lastLoginAt?: Date };
const toRow = (u: UserRow) => ({
  id: String(u._id),
  name: u.name,
  email: u.email ?? null,
  phone: u.phone ?? null,
  status: u.status,
  platformRole: u.platformRole ?? null,
  isSeller: u.isSeller,
  walletBalance: u.walletBalance ?? 0,
  coins: u.coins ?? 0,
  createdAt: iso(u.createdAt),
  lastLoginAt: iso(u.lastLoginAt),
});
const USER_FIELDS = 'name email phone status platformRole isSeller walletBalance coins createdAt lastLoginAt';

adminUsersRouter.get(
  '/users',
  ...can(PERMISSIONS.ADMIN_USERS_VIEW),
  validate({ query: adminUserListQuerySchema }),
  asyncHandler(async (req, res) => {
    const f = q<UserListQuery>(req);
    if (f.format === 'csv') {
      await audit({ action: 'admin.export_csv', targetType: 'User', meta: { resource: 'users' }, req });
      const cursor = User.find(userFilter(f)).select(USER_FIELDS).sort({ _id: -1 }).lean<UserRow[]>().cursor();
      return streamCsv(res, 'users.csv', [
        { header: 'id', value: (u: UserRow) => String(u._id) },
        { header: 'name', value: (u) => u.name },
        { header: 'email', value: (u) => u.email },
        { header: 'phone', value: (u) => u.phone },
        { header: 'status', value: (u) => u.status },
        { header: 'platformRole', value: (u) => u.platformRole },
        { header: 'isSeller', value: (u) => u.isSeller },
        { header: 'createdAt', value: (u) => u.createdAt },
      ], cursor as AsyncIterable<UserRow>);
    }
    const rows = await User.find({ ...userFilter(f), ...cursorFilter('_id', -1, f.cursor) }).select(USER_FIELDS).sort(cursorSort('_id', -1)).limit(f.limit + 1).lean<(UserRow & { _id: never })[]>();
    const page = paginate(rows as never[], f.limit, '_id');
    res.json({ data: (page.items as UserRow[]).map(toRow), meta: { nextCursor: page.nextCursor } });
  }),
);

adminUsersRouter.get(
  '/users/:id',
  ...can(PERMISSIONS.ADMIN_USERS_VIEW),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const u = await User.findById(req.params.id).select(`${USER_FIELDS} emailVerified phoneVerified twoFactor.enabled referralCode`).lean();
    if (!u) throw notFound('User');
    const [orders, orderCount, spent, memberships, sessions] = await Promise.all([
      Order.find({ buyerId: u._id }).sort({ createdAt: -1 }).limit(10).select('number status total storeId createdAt').lean(),
      Order.countDocuments({ buyerId: u._id }),
      Order.aggregate<{ t: number }>([{ $match: { buyerId: u._id, status: { $nin: ['cancelled', 'pending_payment'] } } }, { $group: { _id: null, t: { $sum: '$total' } } }]),
      StoreMember.find({ userId: u._id }).select('storeId role status').lean(),
      Session.countDocuments({ userId: u._id, revokedAt: null, expiresAt: { $gt: new Date() } }),
    ]);
    const stores = await Store.find({ _id: { $in: memberships.map((m) => m.storeId) } }).select('name slug status').lean();
    res.json({
      data: {
        ...toRow(u as unknown as UserRow),
        emailVerified: u.emailVerified,
        phoneVerified: u.phoneVerified,
        twoFactorEnabled: !!u.twoFactor?.enabled,
        referralCode: u.referralCode,
        orders: { count: orderCount, totalSpent: spent[0]?.t ?? 0, recent: orders.map((o) => ({ id: String(o._id), number: o.number, status: o.status, total: o.total, createdAt: iso(o.createdAt) })) },
        stores: memberships.map((m) => {
          const s = stores.find((x) => String(x._id) === String(m.storeId));
          return { id: String(m.storeId), name: s?.name ?? '', slug: s?.slug ?? '', status: s?.status ?? null, role: m.role, memberStatus: m.status };
        }),
        activeSessions: sessions,
      },
    });
  }),
);

async function loadTarget(req: Request) {
  const user = await User.findById(req.params.id).select('status platformRole name email');
  if (!user || user.status === 'deleted') throw notFound('User');
  return user;
}

adminUsersRouter.post(
  '/users/:id/block',
  ...can(PERMISSIONS.ADMIN_USERS_MANAGE),
  validate({ params: idParams, body: adminReasonSchema }),
  asyncHandler(async (req, res) => {
    const user = await loadTarget(req);
    if (String(user._id) === req.user!.id) throw new AppError(400, 'CANNOT_BLOCK_SELF', 'You cannot block your own account');
    if (user.platformRole) throw new AppError(403, 'TARGET_IS_STAFF', 'Remove the staff role before blocking this account');
    await User.updateOne({ _id: user._id }, { $set: { status: 'blocked' } });
    const revoked = await revokeAllSessions(user._id);
    await audit({ action: 'admin.user_blocked', targetType: 'User', targetId: user._id, meta: { reason: req.body.reason, revokedSessions: revoked }, req });
    res.json({ data: { id: String(user._id), status: 'blocked', revokedSessions: revoked } });
  }),
);

adminUsersRouter.post(
  '/users/:id/unblock',
  ...can(PERMISSIONS.ADMIN_USERS_MANAGE),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const user = await loadTarget(req);
    await User.updateOne({ _id: user._id, status: 'blocked' }, { $set: { status: 'active', failedLoginCount: 0 }, $unset: { lockUntil: 1 } });
    await audit({ action: 'admin.user_unblocked', targetType: 'User', targetId: user._id, req });
    res.json({ data: { id: String(user._id), status: 'active' } });
  }),
);

adminUsersRouter.post(
  '/users/:id/logout',
  ...can(PERMISSIONS.ADMIN_USERS_MANAGE),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const user = await loadTarget(req);
    const revoked = await revokeAllSessions(user._id);
    await audit({ action: 'admin.user_force_logout', targetType: 'User', targetId: user._id, meta: { revokedSessions: revoked }, req });
    res.json({ data: { revokedSessions: revoked } });
  }),
);

/** SUPER_ADMIN only (ADMIN_STAFF_MANAGE). The last active SUPER_ADMIN can never be demoted. */
export async function setPlatformRole(req: Request, userId: string, role: string | null) {
  if (req.user!.platformRole !== 'SUPER_ADMIN') throw new AppError(403, 'FORBIDDEN', 'Only a Super Admin can change staff roles');
  const user = await User.findById(userId).select('status platformRole');
  if (!user || user.status === 'deleted') throw notFound('User');
  const from = user.platformRole ?? null;
  if (from === role) return { id: String(user._id), platformRole: role };
  if (from === 'SUPER_ADMIN') {
    const supers = await User.countDocuments({ platformRole: 'SUPER_ADMIN', status: 'active' });
    if (supers <= 1) throw new AppError(409, 'LAST_SUPER_ADMIN', 'You cannot remove the last Super Admin');
  }
  await User.updateOne({ _id: user._id }, role ? { $set: { platformRole: role } } : { $unset: { platformRole: 1 } });
  // Guard against two concurrent demotions: if no active SUPER_ADMIN is left, roll ours back.
  if (from === 'SUPER_ADMIN' && (await User.countDocuments({ platformRole: 'SUPER_ADMIN', status: 'active' })) === 0) {
    await User.updateOne({ _id: user._id }, { $set: { platformRole: 'SUPER_ADMIN' } });
    throw new AppError(409, 'LAST_SUPER_ADMIN', 'You cannot remove the last Super Admin');
  }
  await audit({ action: 'admin.user_role_changed', targetType: 'User', targetId: user._id, meta: { from, to: role }, req });
  return { id: String(user._id), platformRole: role };
}

adminUsersRouter.patch(
  '/users/:id/role',
  ...can(PERMISSIONS.ADMIN_STAFF_MANAGE),
  validate({ params: idParams, body: adminSetRoleSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await setPlatformRole(req, req.params.id!, req.body.platformRole) });
  }),
);

adminUsersRouter.post(
  '/users/:id/wallet-adjust',
  ...can(PERMISSIONS.ADMIN_FINANCE_MANAGE),
  validate({ params: idParams, body: adminWalletAdjustSchema }),
  asyncHandler(async (req, res) => {
    const user = await loadTarget(req);
    const { amount, reason } = req.body as { amount: number; reason: string };
    const entry = { userId: user._id, amount: Math.abs(amount), reason: 'admin_adjustment', ref: `admin-adjust:${randomUUID()}`, meta: { note: reason, by: req.user!.id } };
    const r = amount > 0 ? await credit(entry) : await debit(entry);
    await audit({ action: 'admin.wallet_adjusted', targetType: 'User', targetId: user._id, meta: { amount, reason, transactionId: r.transactionId }, req });
    res.json({ data: { balance: r.balance, transactionId: r.transactionId } });
  }),
);

// ---------------- impersonation ----------------
adminUsersRouter.post(
  '/users/:id/impersonate',
  ...can(PERMISSIONS.ADMIN_USERS_IMPERSONATE),
  validate({ params: idParams, body: adminReasonSchema }),
  asyncHandler(async (req, res) => {
    const target = await User.findById(req.params.id).select('status platformRole name');
    if (!target || target.status === 'deleted') throw notFound('User');
    if (target.platformRole) throw new AppError(403, 'CANNOT_IMPERSONATE_STAFF', 'Staff and admin accounts cannot be impersonated');
    if (target.status !== 'active') throw new AppError(409, 'USER_NOT_ACTIVE', 'Only active accounts can be impersonated');
    const adminId = oid(req.user!.id);
    // The admin's own session is replaced by the impersonated one (its cookies are overwritten).
    await Session.updateOne({ _id: oid(req.user!.sessionId), revokedAt: null }, { $set: { revokedAt: new Date() } });
    const session = await startSession(req, res, target._id, { impersonatorId: adminId });
    await Session.updateOne({ _id: session._id }, { $set: { expiresAt: new Date(Date.now() + IMPERSONATION_TTL_MS) } });
    await audit({ action: 'admin.impersonation_started', targetType: 'User', targetId: target._id, meta: { reason: req.body.reason, sessionId: String(session._id) }, req });
    res.json({ data: { user: { id: String(target._id), name: target.name }, impersonatorId: String(adminId), expiresAt: new Date(Date.now() + IMPERSONATION_TTL_MS).toISOString() } });
  }),
);

adminUsersRouter.post(
  '/impersonation/stop',
  requireAuth,
  asyncHandler(async (req, res) => {
    const impersonatorId = req.user!.impersonatorId;
    if (!impersonatorId) throw new AppError(400, 'NOT_IMPERSONATING', 'You are not impersonating anyone');
    await Session.updateOne({ _id: oid(req.user!.sessionId) }, { $set: { revokedAt: new Date() } });
    const admin = await User.findById(impersonatorId).select('status platformRole');
    await audit({ action: 'admin.impersonation_stopped', actorId: impersonatorId, targetType: 'User', targetId: req.user!.id, req });
    if (!admin || admin.status !== 'active' || !admin.platformRole) {
      throw new AppError(401, 'SESSION_REVOKED', 'Your admin session has ended. Please log in again.');
    }
    await startSession(req, res, admin._id);
    res.json({ data: { id: String(admin._id), platformRole: admin.platformRole } });
  }),
);
