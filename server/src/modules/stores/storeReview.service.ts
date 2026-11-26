import type { Request } from 'express';
import { Types } from 'mongoose';
import { env } from '../../config/env';
import { AppError, notFound } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { getEmail } from '../../services/email';
import { audit } from '../audit/audit.service';
import { invalidateStoreIndex } from '../catalog/catalog.service';
import { User } from '../users/user.model';
import { Store } from './store.model';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

async function notifyOwner(ownerId: unknown, subject: string, text: string): Promise<void> {
  const owner = await User.findById(ownerId).select('email').lean();
  if (!owner?.email) return;
  getEmail()
    .send({ to: owner.email, subject, text, html: `<p>${esc(text).replace(/\n/g, '<br>')}</p>` })
    .catch((err) => logger.warn({ err }, 'store review email failed'));
}

/** Who made the decision: an admin (`req`) or the automated reviewer (`actor`). */
export type ReviewActor = { req: Request } | { actor: 'ai_reviewer' };

/**
 * Approves or rejects a PENDING store. The conditional update makes concurrent reviews (two admins, or
 * an admin and the automated reviewer) safe: only the first one wins, the other gets STORE_NOT_PENDING.
 */
export async function reviewStore(storeId: string | Types.ObjectId, to: 'approved' | 'rejected', by: ReviewActor, reason?: string, meta: Record<string, unknown> = {}) {
  const update =
    to === 'approved'
      ? { $set: { status: 'approved', approvedAt: new Date() }, $unset: { rejectionReason: 1 } }
      : { $set: { status: 'rejected', rejectionReason: reason } };
  // An admin may also approve a previously rejected store (override of a wrong decision, e.g. by the automated reviewer).
  const from = to === 'approved' && !('actor' in by) ? ['pending', 'rejected'] : ['pending'];
  const store = await Store.findOneAndUpdate({ _id: storeId, status: { $in: from } }, update, { new: true });
  if (!store) {
    if (!(await Store.exists({ _id: storeId }))) throw notFound('Store');
    throw new AppError(409, 'STORE_NOT_PENDING', 'This store is not awaiting review');
  }
  invalidateStoreIndex();
  const auto = 'actor' in by;
  await audit({
    action: `${auto ? 'ai' : 'admin'}.store_${to === 'approved' ? 'approved' : 'rejected'}`,
    targetType: 'Store',
    targetId: store._id,
    storeId: store._id,
    meta: { ...(reason ? { reason } : {}), ...meta },
    ...(auto ? { actorRole: 'ai_reviewer' } : { req: by.req }),
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
