import { STORE_ROLE_PERMISSIONS } from '@souqly/shared';
import type { RequestHandler } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../lib/AppError';
import { Store } from '../modules/stores/store.model';
import { StoreMember } from '../modules/stores/storeMember.model';

/**
 * Loads the store the user is acting on. `x-store-id` only SELECTS among stores the user is an
 * active member of; without it the user's first store is used. Sets req.store, req.storeMember,
 * req.storePermissions. Must run after requireAuth.
 */
export const storeContext: RequestHandler = (req, _res, next) => {
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

    req.store = store;
    req.storeMember = member;
    req.storePermissions =
      member.permissions.length > 0 ? [...member.permissions] : [...STORE_ROLE_PERMISSIONS[member.role]];
  })().then(() => next(), next);
};
