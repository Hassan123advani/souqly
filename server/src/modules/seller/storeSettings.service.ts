import type { ChatSettings, NotificationSettings, ShippingSettings } from '@souqly/shared';
import { Types } from 'mongoose';
import { StoreSettings } from './storeSettings.model';

export const DEFAULT_SHIPPING: ShippingSettings = {
  zones: [{ name: 'Nationwide', cities: 'all', rate: 20_000, etaDays: [2, 5] }],
  processingDays: 1,
};
export const DEFAULT_NOTIFICATIONS: NotificationSettings = { newOrderEmail: true, newOrderSound: true, lowStockEmail: true, lowStockThreshold: 5 };
export const DEFAULT_CHAT: ChatSettings = { quickReplies: [], autoReply: { enabled: false, message: '' } };

const oid = (id: Types.ObjectId | string) => new Types.ObjectId(String(id));

/**
 * Store shipping rules (Phase 6 pricing uses this). Returns the defaults when the store never saved any.
 * Zones are matched in order; a zone with `cities: 'all'` is the fallback.
 */
export async function getShippingSettings(storeId: Types.ObjectId | string): Promise<ShippingSettings> {
  const doc = await StoreSettings.findOne({ storeId: oid(storeId) }).select('shipping').lean();
  return doc?.shipping ?? DEFAULT_SHIPPING;
}

/** True once the seller saved their own shipping settings (onboarding checklist). */
export async function hasCustomShipping(storeId: Types.ObjectId | string): Promise<boolean> {
  return !!(await StoreSettings.exists({ storeId: oid(storeId), shipping: { $exists: true } }));
}

export async function getNotificationSettings(storeId: Types.ObjectId | string): Promise<NotificationSettings> {
  const doc = await StoreSettings.findOne({ storeId: oid(storeId) }).select('notifications').lean();
  return { ...DEFAULT_NOTIFICATIONS, ...(doc?.notifications ?? {}) };
}

export async function getLowStockThreshold(storeId: Types.ObjectId | string): Promise<number> {
  return (await getNotificationSettings(storeId)).lowStockThreshold;
}

export async function getChatSettings(storeId: Types.ObjectId | string): Promise<ChatSettings> {
  const doc = await StoreSettings.findOne({ storeId: oid(storeId) }).select('chat').lean();
  return { ...DEFAULT_CHAT, ...(doc?.chat ?? {}) };
}

export async function saveSection<K extends 'shipping' | 'notifications' | 'chat'>(storeId: Types.ObjectId, key: K, value: unknown): Promise<void> {
  await StoreSettings.updateOne({ storeId }, { $set: { [key]: value } }, { upsert: true });
}
