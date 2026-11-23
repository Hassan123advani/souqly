import { Schema, Types, model } from 'mongoose';

export interface IPushSubscription {
  userId: Types.ObjectId;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const pushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    endpoint: { type: String, required: true, maxlength: 1000 },
    keys: { p256dh: { type: String, required: true, maxlength: 200 }, auth: { type: String, required: true, maxlength: 100 } },
    userAgent: { type: String, maxlength: 300 },
  },
  { timestamps: true },
);

pushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });
pushSubscriptionSchema.index({ userId: 1 });

export const PushSubscription = model<IPushSubscription>('PushSubscription', pushSubscriptionSchema);
