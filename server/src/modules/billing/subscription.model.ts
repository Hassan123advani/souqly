import { STORE_PLANS, type StorePlan } from '@souqly/shared';
import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

/**
 * One subscription per store (docs/api-billing.md §3). `plan` mirrors `Store.plan` (the store field
 * is what limit checks read); monthly periods are anchored on `anchorDay` (1..31, clamped to the
 * month's length). `lockVersion` is bumped inside every financial transaction of the store so
 * concurrent balance spends serialize on a write conflict (D-078).
 */
export interface ISubscription {
  storeId: Types.ObjectId;
  plan: StorePlan;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  anchorDay: number;
  scheduledChange?: { plan: StorePlan; effectiveAt: Date; kind: 'downgrade' | 'cancel'; requestedBy?: Types.ObjectId; requestedAt: Date } | null;
  lockVersion: number;
  /** High-water mark of the per-store commission safety-net sync (code review M6). */
  commissionSyncedAt?: Date | null;
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ISubscription>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    plan: { type: String, enum: STORE_PLANS, default: 'free' },
    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true },
    anchorDay: { type: Number, required: true, min: 1, max: 31 },
    scheduledChange: {
      type: new Schema({ plan: { type: String, enum: STORE_PLANS }, effectiveAt: Date, kind: String, requestedBy: Schema.Types.ObjectId, requestedAt: Date }, { _id: false }),
      default: null,
    },
    lockVersion: { type: Number, default: 0 },
    commissionSyncedAt: { type: Date, default: null },
    demo: { type: Boolean, default: false },
  },
  { timestamps: true },
);
schema.index({ storeId: 1 }, { unique: true });
// Daily sweep: subscriptions whose period has ended.
schema.index({ currentPeriodEnd: 1 });
schema.index({ plan: 1 });

export const Subscription = model<ISubscription>('Subscription', schema);
export type SubscriptionDoc = HydratedDocument<ISubscription>;
export type SubscriptionLean = ISubscription & { _id: Types.ObjectId };
