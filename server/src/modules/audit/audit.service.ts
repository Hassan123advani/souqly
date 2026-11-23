import type { Request } from 'express';
import { Types } from 'mongoose';
import { logger } from '../../lib/logger';
import { AuditLog } from './auditLog.model';

export type AuditEntry = {
  action: string;
  actorId?: string | Types.ObjectId | null;
  actorRole?: string;
  targetType?: string;
  targetId?: string | Types.ObjectId;
  meta?: Record<string, unknown>;
  /** Defaults to req.store (Seller Center routes) so the action shows up in the store activity log. */
  storeId?: string | Types.ObjectId;
  req?: Request;
};

/** Writes an audit entry. Never throws: an audit failure must not break the user's action. Never pass secrets in meta. */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    const actorId = entry.actorId ?? entry.req?.user?.id;
    const storeId = entry.storeId ?? entry.req?.store?._id;
    await AuditLog.create({
      action: entry.action,
      actorId: actorId ? new Types.ObjectId(String(actorId)) : undefined,
      actorRole: entry.actorRole ?? entry.req?.user?.platformRole ?? (actorId ? 'user' : 'anonymous'),
      targetType: entry.targetType,
      targetId: entry.targetId ? String(entry.targetId) : undefined,
      ip: entry.req?.ip,
      ...(storeId ? { storeId: new Types.ObjectId(String(storeId)) } : {}),
      meta: {
        ...entry.meta,
        ...(entry.req?.user?.impersonatorId ? { impersonatorId: entry.req.user.impersonatorId } : {}),
      },
    });
  } catch (err) {
    logger.error({ err, action: entry.action }, 'Failed to write audit log');
  }
}
