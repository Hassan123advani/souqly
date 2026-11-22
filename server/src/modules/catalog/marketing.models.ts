import { HOME_SECTION_TYPES } from '@souqly/shared';
import { Schema, Types, model } from 'mongoose';

// ---------------------------------------------------------------------------------------------
// HomeContent (CMS for the home page; admin editor in Phase 9)
// ---------------------------------------------------------------------------------------------
export interface IHomeContent {
  key: 'home';
  heroSlides: { image: string; title: string; subtitle?: string; ctaText?: string; ctaLink?: string; theme?: string }[];
  sections: { type: (typeof HOME_SECTION_TYPES)[number]; title: string; enabled: boolean; order: number; config: Record<string, unknown> }[];
  demo: boolean;
}

const homeContentSchema = new Schema<IHomeContent>(
  {
    key: { type: String, required: true, unique: true, enum: ['home'] },
    heroSlides: [{ image: String, title: String, subtitle: String, ctaText: String, ctaLink: String, theme: String, _id: false }],
    sections: [
      {
        type: { type: String, enum: HOME_SECTION_TYPES, required: true },
        title: String,
        enabled: { type: Boolean, default: true },
        order: { type: Number, default: 0 },
        config: { type: Schema.Types.Mixed, default: {} },
        _id: false,
      },
    ],
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, minimize: false },
);
export const HomeContent = model<IHomeContent>('HomeContent', homeContentSchema);

// ---------------------------------------------------------------------------------------------
// FlashSale
// ---------------------------------------------------------------------------------------------
export interface IFlashSale {
  title: string;
  startsAt: Date;
  endsAt: Date;
  items: { productId: Types.ObjectId; variantId?: Types.ObjectId; flashPrice: number; quantityLimit: number; sold: number }[];
  isActive: boolean;
  demo: boolean;
}

const flashSaleSchema = new Schema<IFlashSale>(
  {
    title: { type: String, required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    items: [
      {
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        variantId: Schema.Types.ObjectId,
        flashPrice: { type: Number, required: true, min: 0 },
        quantityLimit: { type: Number, default: 100 },
        sold: { type: Number, default: 0 },
        _id: false,
      },
    ],
    isActive: { type: Boolean, default: true },
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);
flashSaleSchema.index({ isActive: 1, startsAt: 1, endsAt: 1 });
export const FlashSale = model<IFlashSale>('FlashSale', flashSaleSchema);

// ---------------------------------------------------------------------------------------------
// Campaign
// ---------------------------------------------------------------------------------------------
export interface ICampaign {
  slug: string;
  name: string;
  theme?: string;
  banner?: string;
  startsAt: Date;
  endsAt: Date;
  description?: string;
  productIds?: Types.ObjectId[];
  categoryIds?: Types.ObjectId[];
  storeIds?: Types.ObjectId[];
  demo: boolean;
}

const campaignSchema = new Schema<ICampaign>(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    theme: String,
    banner: String,
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    description: String,
    productIds: { type: [Schema.Types.ObjectId], default: undefined },
    categoryIds: { type: [Schema.Types.ObjectId], default: undefined },
    storeIds: { type: [Schema.Types.ObjectId], default: undefined },
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);
campaignSchema.index({ startsAt: 1, endsAt: 1 });
export const Campaign = model<ICampaign>('Campaign', campaignSchema);

// ---------------------------------------------------------------------------------------------
// SearchLog (TTL 90 days) → trending searches + per-user history
// ---------------------------------------------------------------------------------------------
export interface ISearchLog {
  userId?: Types.ObjectId;
  q: string;
  normalized: string;
  resultCount: number;
  createdAt: Date;
}

const searchLogSchema = new Schema<ISearchLog>({
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  q: { type: String, required: true, maxlength: 100 },
  normalized: { type: String, required: true, maxlength: 100 },
  resultCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: () => new Date() },
});
searchLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });
searchLogSchema.index({ userId: 1, createdAt: -1 }, { partialFilterExpression: { userId: { $exists: true } } });
searchLogSchema.index({ createdAt: -1, normalized: 1 });
export const SearchLog = model<ISearchLog>('SearchLog', searchLogSchema);

// ---------------------------------------------------------------------------------------------
// RecentlyViewed (logged-in users; capped at 50 per user)
// ---------------------------------------------------------------------------------------------
export interface IRecentlyViewed {
  userId: Types.ObjectId;
  productId: Types.ObjectId;
  viewedAt: Date;
}

const recentlyViewedSchema = new Schema<IRecentlyViewed>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  viewedAt: { type: Date, default: () => new Date() },
});
recentlyViewedSchema.index({ userId: 1, productId: 1 }, { unique: true });
recentlyViewedSchema.index({ userId: 1, viewedAt: -1 });
export const RecentlyViewed = model<IRecentlyViewed>('RecentlyViewed', recentlyViewedSchema);
