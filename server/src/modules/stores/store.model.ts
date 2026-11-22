import { STORE_STATUSES, type StoreStatus } from '@souqly/shared';
import { Schema, Types, model, type HydratedDocument } from 'mongoose';

/** Minimal store model for auth/storeContext. Phase 5 (seller onboarding) extends it. */
export interface IStore {
  ownerId: Types.ObjectId;
  name: string;
  slug: string;
  status: StoreStatus;
  logo?: { url: string; key: string };
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const storeSchema = new Schema<IStore>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 40 },
    status: { type: String, enum: STORE_STATUSES, default: 'pending', index: true },
    logo: { url: String, key: String },
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

export const Store = model<IStore>('Store', storeSchema);
export type StoreDoc = HydratedDocument<IStore>;
