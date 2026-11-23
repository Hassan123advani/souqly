import { Schema, Types, model } from 'mongoose';

export const ANALYTICS_EVENT_TYPES = ['add_to_cart', 'product_view', 'store_view'] as const;
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

/**
 * Lightweight daily counters (Phase 10). One document per (store, day, type, product?, source).
 * `productId` null = store-level counter; `source` '' = no referrer/utm given.
 */
export interface IAnalyticsEvent {
  storeId: Types.ObjectId;
  date: string;
  type: AnalyticsEventType;
  productId: Types.ObjectId | null;
  source: string;
  count: number;
  demo: boolean;
}

const schema = new Schema<IAnalyticsEvent>({
  storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
  date: { type: String, required: true },
  type: { type: String, enum: ANALYTICS_EVENT_TYPES, required: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
  source: { type: String, default: '', maxlength: 60 },
  count: { type: Number, default: 0 },
  demo: { type: Boolean, default: false },
});
schema.index({ storeId: 1, date: 1, type: 1, productId: 1, source: 1 }, { unique: true });
schema.index({ storeId: 1, type: 1, date: 1 });

export const AnalyticsEvent = model<IAnalyticsEvent>('AnalyticsEvent', schema);
