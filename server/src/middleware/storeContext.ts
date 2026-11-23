import { STORE_PERMISSIONS, STORE_ROLE_PERMISSIONS } from '@souqly/shared';
import type { RequestHandler } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../lib/AppError';
import { CustomRole } from '../modules/staff/customRole.model';
import { Store } from '../modules/stores/store.model';
import { StoreMember, type StoreMemberDoc } from '../modules/stores/storeMember.model';

const STORE_PERMISSION_SET = new Set<string>(STORE_PERMISSIONS);

/**
 * Effective permissions of a membership: CUSTOM → the store's CustomRole (deleted role = nothing);
 * explicit `permissions` (legacy) → those; otherwise the built-in role's defaults. Always ⊆ store.*.
 */
export async function resolveMemberPermissions(member: StoreMemberDoc): Promise<string[]> {
  let perms: readonly string[];
  if (member.customRoleId) {
    const role = await CustomRole.findOne({ _id: member.customRoleId, storeId: member.storeId }).select('permissions').lean();
    perms = role?.permissions ?? [];
  } else if (member.permissions.length > 0) {
    perms = member.permissions;
  } else {
    perms = STORE_ROLE_PERMISSIONS[member.role] ?? [];
  }
  return perms.filter((p) => STORE_PERMISSION_SET.has(p));
}

/**
 * Loads the store the user is acting on. `x-store-id` only SELECTS among stores the user is an
 * active member of; without it the user's first store is used. Sets req.store, req.storeMember,
 * req.storePermissions. Must run after requireAuth.
 * `allowRejected` is used only by the few routes a rejected store needs to fix its application
 * (GET /seller/store, PATCH /seller/store/business|payout). Suspended stores are always locked out.
 */
export function makeStoreContext(opts: { allowRejected?: boolean } = {}): RequestHandler {
  return (req, _res, next) => {
    (async () => {
      if (!req.user) throw new AppError(401, 'UNAUTHENTICATED', 'Please log in to continue');
      const userId = new Types.ObjectId(req.user.id);
      const header = req.header('x-store-id');

      let member;
      if (header) {
        if (!Types.ObjectId.isValid(header) || String(new Types.ObjectId(header)) !== header.toLowerCase()) {
          throw new AppError(400, 'INVALID_STORE_ID', 'Invalid store id');
        }
        member = await StoreMember.findOne({ storeId: new Types.ObjectId(header), userId, status: 'active' });
        if (!member) throw new AppError(403, 'STORE_FORBIDDEN', 'You are not a member of this store');
      } else {
        member = await StoreMember.findOne({ userId, status: 'active' }).sort({ createdAt: 1 });
        if (!member) throw new AppError(403, 'NO_STORE', 'You do not have a store yet');
      }

      const store = await Store.findById(member.storeId);
      if (!store) throw new AppError(403, 'STORE_FORBIDDEN', 'Store not found');
      // Pending stores may set up their catalog; suspended / rejected stores are locked out of the Seller Center.
      if (store.status === 'suspended' || (store.status === 'rejected' && !opts.allowRejected)) {
        throw new AppError(403, 'STORE_SUSPENDED', 'This store is suspended or was not approved. Contact Souqly support.', {
          status: store.status,
        });
      }

      req.store = store;
      req.storeMember = member;
      req.storePermissions = await resolveMemberPermissions(member);
    })().then(() => next(), next);
  };
}

export const storeContext = makeStoreContext();
export const storeContextAllowRejected = makeStoreContext({ allowRejected: true });

/** Only the store's OWNER membership passes. */
export const requireStoreOwner: RequestHandler = (req, _res, next) => {
  if (req.storeMember?.role !== 'OWNER') return next(new AppError(403, 'FORBIDDEN', 'Only the store owner can do that'));
  next();
};
