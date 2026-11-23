import type { ReportTarget } from '@souqly/shared';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../../lib/AppError';
import { stripHtml } from '../../lib/sanitize';
import { audit } from '../audit/audit.service';
import { Product } from '../catalog/product.model';
import { canAccessConversation } from '../chat/access';
import { Message } from '../chat/chat.models';
import { Review } from '../reviews/review.model';
import { onReviewReported } from '../reviews/review.service';
import { Store } from '../stores/store.model';
import { Report } from './report.model';

const oid = (s: string | Types.ObjectId) => new Types.ObjectId(String(s));

/** Resolves the target (404 when it does not exist / is not visible to the reporter) and its store. */
async function resolveTarget(userId: string, type: ReportTarget, id: Types.ObjectId): Promise<{ storeId?: Types.ObjectId }> {
  switch (type) {
    case 'product': {
      const p = await Product.findOne({ _id: id, status: 'published' }).select('storeId').lean();
      if (!p) break;
      return { storeId: p.storeId };
    }
    case 'store': {
      const s = await Store.findOne({ _id: id, status: 'approved' }).select('_id').lean();
      if (!s) break;
      return { storeId: s._id };
    }
    case 'review': {
      const r = await Review.findOne({ _id: id, status: 'published' }).select('storeId buyerId').lean();
      if (!r) break;
      if (String(r.buyerId) === userId) throw new AppError(400, 'OWN_CONTENT', 'You cannot report your own review');
      return { storeId: r.storeId };
    }
    case 'message': {
      const m = await Message.findById(id).select('conversationId senderId').lean();
      if (!m) break;
      // Only a participant of the conversation can report one of its messages.
      const access = await canAccessConversation(userId, m.conversationId);
      if (!access) break;
      if (String(m.senderId) === userId) throw new AppError(400, 'OWN_CONTENT', 'You cannot report your own message');
      return { storeId: access.storeId };
    }
  }
  throw new AppError(404, 'NOT_FOUND', 'Not found');
}

export async function createReport(req: Request, input: { targetType: ReportTarget; targetId: string; reason: string; details?: string }): Promise<{ id: string }> {
  const userId = req.user!.id;
  const targetId = oid(input.targetId);
  const { storeId } = await resolveTarget(userId, input.targetType, targetId);
  const details = input.details ? stripHtml(input.details).slice(0, 1000) : undefined;
  let report;
  try {
    report = await Report.create({
      reporterId: oid(userId),
      targetType: input.targetType,
      targetId,
      ...(storeId ? { storeId } : {}),
      reason: input.reason,
      ...(details ? { details } : {}),
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new AppError(409, 'ALREADY_REPORTED', 'You have already reported this');
    throw err;
  }
  if (input.targetType === 'review') await onReviewReported(targetId);
  await audit({ action: 'report.created', req, targetType: input.targetType, targetId, meta: { reason: input.reason } });
  return { id: String(report._id) };
}
