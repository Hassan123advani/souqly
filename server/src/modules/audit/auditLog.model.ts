import { Schema, Types, model } from 'mongoose';

export interface IAuditLog {
  actorId?: Types.ObjectId;
  actorRole?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  ip?: string;
  /** Set for actions performed inside a store (Seller Center activity log). */
  storeId?: Types.ObjectId;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>({
  actorId: { type: Schema.Types.ObjectId, ref: 'User' },
  actorRole: { type: String },
  action: { type: String, required: true },
  targetType: { type: String },
  targetId: { type: String },
  ip: { type: String },
  storeId: { type: Schema.Types.ObjectId, ref: 'Store' },
  meta: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: () => new Date() },
});
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ storeId: 1, _id: -1 }, { partialFilterExpression: { storeId: { $exists: true } } });

export const AuditLog = model<IAuditLog>('AuditLog', auditLogSchema);
