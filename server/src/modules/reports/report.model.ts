import { REPORT_TARGETS, type ReportTarget } from '@souqly/shared';
import { Schema, Types, model } from 'mongoose';

export const REPORT_STATUSES = ['open', 'reviewing', 'resolved', 'dismissed'] as const;

export interface IReport {
  reporterId: Types.ObjectId;
  targetType: ReportTarget;
  targetId: Types.ObjectId;
  /** Store owning the target (when known) — lets admins group reports per store. */
  storeId?: Types.ObjectId;
  reason: string;
  details?: string;
  status: (typeof REPORT_STATUSES)[number];
  resolution?: { by: Types.ObjectId; at: Date; note?: string };
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IReport>(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: REPORT_TARGETS, required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store' },
    reason: { type: String, required: true, maxlength: 40 },
    details: { type: String, maxlength: 1000 },
    status: { type: String, enum: REPORT_STATUSES, default: 'open' },
    resolution: { type: { by: Schema.Types.ObjectId, at: Date, note: String, _id: false }, default: undefined },
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

schema.index({ reporterId: 1, targetType: 1, targetId: 1 }, { unique: true });
schema.index({ status: 1, createdAt: -1 });
schema.index({ targetType: 1, targetId: 1 });

export const Report = model<IReport>('Report', schema);

// ---------------- Fraud signals (admin review queue) ----------------
export interface IFraudSignal {
  /** e.g. new_account_review | review_burst | owner_ip_review */
  type: string;
  refType: string;
  refId: Types.ObjectId;
  score: number;
  details?: Record<string, unknown>;
  status: 'open' | 'cleared' | 'actioned';
  createdAt: Date;
}

const fraudSchema = new Schema<IFraudSignal>(
  {
    type: { type: String, required: true, maxlength: 40 },
    refType: { type: String, required: true, maxlength: 40 },
    refId: { type: Schema.Types.ObjectId, required: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    details: { type: Schema.Types.Mixed },
    status: { type: String, enum: ['open', 'cleared', 'actioned'], default: 'open' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
fraudSchema.index({ status: 1, createdAt: -1 });
fraudSchema.index({ refType: 1, refId: 1, type: 1 }, { unique: true });

export const FraudSignal = model<IFraudSignal>('FraudSignal', fraudSchema);
