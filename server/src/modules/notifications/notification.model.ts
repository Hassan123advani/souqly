import { Schema, Types, model, type HydratedDocument } from 'mongoose';

export const NOTIFICATION_TTL_SECONDS = 180 * 24 * 3600;

export interface INotification {
  userId: Types.ObjectId;
  type: string;
  title: string;
  body: string;
  link?: string;
  data?: Record<string, unknown>;
  readAt: Date | null;
  demo?: boolean;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true, maxlength: 60 },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, default: '', maxlength: 1000 },
    link: { type: String, maxlength: 500 },
    data: { type: Schema.Types.Mixed, default: undefined },
    readAt: { type: Date, default: null },
    createdAt: { type: Date, default: () => new Date() },
    demo: { type: Boolean, default: false },
  },
  { versionKey: false },
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: NOTIFICATION_TTL_SECONDS });

export const Notification = model<INotification>('Notification', notificationSchema);
export type NotificationDoc = HydratedDocument<INotification>;
export type NotificationLean = INotification & { _id: Types.ObjectId };
