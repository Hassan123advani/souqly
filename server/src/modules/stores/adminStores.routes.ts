import { PERMISSIONS, objectIdSchema, storeRejectSchema } from '@souqly/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { AppError, notFound } from '../../lib/AppError';
import { asyncHandler } from '../../lib/asyncHandler';
import { logger } from '../../lib/logger';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/permissions';
import { validate } from '../../middleware/validate';
import { getEmail } from '../../services/email';
import { audit } from '../audit/audit.service';
import { invalidateStoreIndex } from '../catalog/catalog.service';
import { escapeHtml } from '../onboarding/onboarding.service';
import { User } from '../users/user.model';
import { Store } from './store.model';

/** Minimal store review API (the full admin panel comes later). Mounted at /api/v1/admin. */
export const adminStoresRouter = Router();
const MANAGE = [requireAuth, requirePermission(PERMISSIONS.ADMIN_STORES_MANAGE)];
const idParams = z.object({ id: objectIdSchema });

async function notifyOwner(ownerId: unknown, subject: string, text: string): Promise<void> {
  const owner = await User.findById(ownerId).select('email').lean();
  if (!owner?.email) return;
  getEmail()
    .send({ to: owner.email, subject, text, html: `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>` })
    .catch((err) => logger.warn({ err }, 'store review email failed'));
}

async function review(req: Request, to: 'approved' | 'rejected', reason?: string) {
  // Only pending stores are reviewed; the conditional update makes concurrent reviews safe.
  const update =
    to === 'approved'
      ? { $set: { status: 'approved', approvedAt: new Date() }, $unset: { rejectionReason: 1 } }
      : { $set: { status: 'rejected', rejectionReason: reason } };
  const store = await Store.findOneAndUpdate({ _id: req.params.id, status: 'pending' }, update, { new: true });
  if (!store) {
    if (!(await Store.exists({ _id: req.params.id }))) throw notFound('Store');
    throw new AppError(409, 'STORE_NOT_PENDING', 'Only pending stores can be reviewed');
  }
  invalidateStoreIndex();
  await audit({
    action: to === 'approved' ? 'admin.store_approved' : 'admin.store_rejected',
    targetType: 'Store',
    targetId: store._id,
    storeId: store._id,
    meta: reason ? { reason } : {},
    req,
  });
  await notifyOwner(
    store.ownerId,
    to === 'approved' ? `Your store "${store.name}" is live on Souqly` : `Your store "${store.name}" needs changes`,
    to === 'approved'
      ? `Good news! "${store.name}" was approved. Open your Seller Center: ${env.CLIENT_URL}/seller`
      : `"${store.name}" was not approved yet.\nReason: ${reason}\nUpdate your details and resubmit: ${env.CLIENT_URL}/seller`,
  );
  return { id: String(store._id), status: store.status, ...(store.rejectionReason ? { rejectionReason: store.rejectionReason } : {}) };
}

adminStoresRouter.post(
  '/stores/:id/approve',
  ...MANAGE,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.json({ data: await review(req, 'approved') });
  }),
);

adminStoresRouter.post(
  '/stores/:id/reject',
  ...MANAGE,
  validate({ params: idParams, body: storeRejectSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await review(req, 'rejected', req.body.reason) });
  }),
);
