import type { ChatSettings, NotificationSettings, ShippingSettings } from '@souqly/shared';
import { Schema, Types, model } from 'mongoose';

/** One document per store with Seller Center settings. Missing doc / section = defaults (storeSettings.service.ts). */
export interface IStoreSettings {
  storeId: Types.ObjectId;
  shipping?: ShippingSettings;
  notifications?: NotificationSettings;
  chat?: ChatSettings;
  createdAt: Date;
  updatedAt: Date;
}

const storeSettingsSchema = new Schema<IStoreSettings>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    shipping: { type: Schema.Types.Mixed },
    notifications: { type: Schema.Types.Mixed },
    chat: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);
storeSettingsSchema.index({ storeId: 1 }, { unique: true });

export const StoreSettings = model<IStoreSettings>('StoreSettings', storeSettingsSchema);
