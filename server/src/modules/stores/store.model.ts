import { STORE_LAYOUTS, STORE_PLANS, STORE_SECTION_TYPES, STORE_STATUSES, type StoreLayout, type StorePlan, type StoreStatus } from '@souqly/shared';
import { Schema, Types, model, type HydratedDocument } from 'mongoose';

/**
 * Store (docs/api-catalog.md). `business` and `payout` are sensitive (KYC / bank details):
 * `select: false` and NEVER part of a public DTO (see stores.service.ts → toStorePublic).
 */
export interface IStore {
  ownerId: Types.ObjectId;
  name: string;
  slug: string;
  tagline?: string;
  description?: string;
  logo?: { url: string; key: string };
  banner?: { url: string; key: string };
  themeColor: string;
  categoryIds: Types.ObjectId[];
  status: StoreStatus;
  rejectionReason?: string;
  /** Set by an admin suspension (Phase 9). */
  suspension?: { reason: string; at: Date; by: Types.ObjectId };
  isMall: boolean;
  mallRequested: boolean;
  contact: { email?: string; phone?: string; whatsapp?: string };
  address: { line1?: string; area?: string; city?: string; country?: string; postalCode?: string };
  policies: { shipping?: string; returns?: string; warranty?: string };
  layoutTemplate: StoreLayout;
  sections: { type: (typeof STORE_SECTION_TYPES)[number]; title?: string; config: Record<string, unknown> }[];
  seo: { title?: string; description?: string };
  holidayMode: { enabled: boolean; message?: string; until?: Date };
  ratingAvg: number;
  ratingCount: number;
  followerCount: number;
  productCount: number;
  responseRate: number;
  responseTimeHours: number;
  healthScore: number;
  /** Phase 10: factor breakdown + recommendations from the health job. */
  health?: { score: number; factors: { key: string; value: number; weight: number }[]; recommendations: string[]; computedAt: Date };
  plan: StorePlan;
  /**
   * Billing enforcement, separate from moderation `status` (D-082): `suspended` hides the storefront and
   * blocks new orders/publishes, but the Seller Center (billing, orders) stays usable.
   */
  billingStatus: 'active' | 'suspended';
  billingSuspension?: { reason: 'overdue' | 'admin'; invoiceId?: Types.ObjectId | null; note?: string; at: Date; by?: Types.ObjectId | null } | null;
  /** Phase 10: pinned products for the store page featured section (max 12, own products only). */
  featuredProductIds?: Types.ObjectId[];
  /** Encrypted fields (`*Enc`) + `*Last4` for masking; see modules/onboarding/sensitive.ts. */
  business?: Record<string, unknown>;
  payout?: Record<string, unknown>;
  pickupAddress?: Record<string, unknown>;
  slugChangedAt?: Date;
  approvedAt?: Date;
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const storeSchema = new Schema<IStore>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 40 },
    tagline: { type: String, trim: true, maxlength: 120 },
    description: { type: String, maxlength: 2000 },
    logo: { url: String, key: String },
    banner: { url: String, key: String },
    themeColor: { type: String, default: '#0E5E5A' },
    categoryIds: { type: [Schema.Types.ObjectId], default: [] },
    status: { type: String, enum: STORE_STATUSES, default: 'pending', index: true },
    rejectionReason: String,
    suspension: { type: { reason: String, at: Date, by: Schema.Types.ObjectId, _id: false }, default: undefined },
    isMall: { type: Boolean, default: false },
    mallRequested: { type: Boolean, default: false },
    contact: { email: String, phone: String, whatsapp: String },
    address: { line1: String, area: String, city: String, country: { type: String, default: 'PK' }, postalCode: String },
    policies: { shipping: String, returns: String, warranty: String },
    layoutTemplate: { type: String, enum: STORE_LAYOUTS, default: 'classic' },
    sections: [
      {
        type: { type: String, enum: STORE_SECTION_TYPES, required: true },
        title: String,
        config: { type: Schema.Types.Mixed, default: {} },
        _id: false,
      },
    ],
    seo: { title: String, description: String },
    holidayMode: { enabled: { type: Boolean, default: false }, message: String, until: Date },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    followerCount: { type: Number, default: 0 },
    productCount: { type: Number, default: 0 },
    responseRate: { type: Number, default: 100 },
    responseTimeHours: { type: Number, default: 24 },
    healthScore: { type: Number, default: 100 },
    health: { type: Schema.Types.Mixed, default: undefined },
    plan: { type: String, enum: STORE_PLANS, default: 'free' },
    billingStatus: { type: String, enum: ['active', 'suspended'], default: 'active' },
    billingSuspension: { type: { reason: String, invoiceId: Schema.Types.ObjectId, note: String, at: Date, by: Schema.Types.ObjectId, _id: false }, default: null },
    featuredProductIds: { type: [Schema.Types.ObjectId], default: undefined },
    business: { type: Schema.Types.Mixed, select: false },
    payout: { type: Schema.Types.Mixed, select: false },
    pickupAddress: { type: Schema.Types.Mixed, select: false },
    slugChangedAt: Date,
    approvedAt: Date,
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, minimize: false },
);
storeSchema.index({ status: 1, isMall: 1 });
storeSchema.index({ billingStatus: 1, status: 1 });
storeSchema.index({ status: 1, createdAt: -1 });
storeSchema.index({ mallRequested: 1, isMall: 1 });
storeSchema.index({ status: 1, followerCount: -1 });
storeSchema.index({ status: 1, ratingAvg: -1 });
storeSchema.index({ name: 'text' }, { name: 'store_text' });

export const Store = model<IStore>('Store', storeSchema);
export type StoreDoc = HydratedDocument<IStore>;
