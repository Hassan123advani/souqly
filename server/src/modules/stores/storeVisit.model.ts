import { Schema, Types, model } from 'mongoose';

/** Daily traffic counter per store (`date` = UTC YYYY-MM-DD). Fed by public store + product page views. */
export interface IStoreVisit {
  storeId: Types.ObjectId;
  date: string;
  /** Page views (store page + product pages). */
  views: number;
  /** Distinct viewers that day (deduplicated in-process; see storeVisit.service.ts). */
  visitors: number;
}

const storeVisitSchema = new Schema<IStoreVisit>({
  storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
  date: { type: String, required: true },
  views: { type: Number, default: 0 },
  visitors: { type: Number, default: 0 },
});
storeVisitSchema.index({ storeId: 1, date: 1 }, { unique: true });

export const StoreVisit = model<IStoreVisit>('StoreVisit', storeVisitSchema);
