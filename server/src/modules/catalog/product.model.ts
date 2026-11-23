import { PRODUCT_STATUSES, type ProductStatus } from '@souqly/shared';
import { Schema, Types, model, type HydratedDocument, type Model } from 'mongoose';

export interface IVariant {
  _id: Types.ObjectId;
  sku: string;
  options: Record<string, string>;
  price: number;
  compareAtPrice?: number;
  stock: number;
  reserved: number;
  images?: string[];
  barcode?: string;
  weightGrams?: number;
  isActive: boolean;
  /** Per-warehouse split of `stock` (Phase 5 inventory). Optional: empty = all stock unassigned. */
  warehouseStock?: { warehouseId: Types.ObjectId; qty: number }[];
}

export interface IProduct {
  storeId: Types.ObjectId;
  title: string;
  slug: string;
  description: string;
  highlights: string[];
  categoryId: Types.ObjectId;
  categoryPath: Types.ObjectId[];
  brandId?: Types.ObjectId;
  brandName?: string;
  images: { url: string; key: string; alt?: string }[];
  video?: { url: string; key: string };
  attributes: Record<string, string | string[] | number>;
  options: { key: string; name: string; values: string[] }[];
  variants: IVariant[];
  priceMin: number;
  priceMax: number;
  compareAtMax?: number;
  /** Compare-at price of the cheapest variant (what a product card shows next to `priceMin`). */
  compareAtMin?: number;
  discountPct: number;
  totalStock: number;
  status: ProductStatus;
  moderationNote?: string;
  tags: string[];
  searchText: string;
  cod: boolean;
  freeShipping: boolean;
  shipping: { weightGrams: number; dimensionsCm?: { l: number; w: number; h: number }; processingDays: number };
  warranty?: { type: string; period: string };
  returnPolicy?: { days: number; note?: string };
  sizeGuide?: string;
  specs: { label: string; value: string }[];
  wholesaleTiers?: { minQty: number; price: number }[];
  preOrder?: { enabled: boolean; shipsOn?: Date };
  ratingAvg: number;
  ratingCount: number;
  soldCount: number;
  viewCount: number;
  wishlistCount: number;
  isFeatured: boolean;
  publishedAt?: Date;
  deletedAt?: Date;
  demo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IProductMethods {
  /** Recomputes priceMin/priceMax/compareAtMax/compareAtMin/discountPct/totalStock from the variants. */
  recomputeDerived(): void;
}

type ProductModel = Model<IProduct, object, IProductMethods>;

const variantSchema = new Schema<IVariant>({
  sku: { type: String, required: true, trim: true },
  options: { type: Schema.Types.Mixed, default: {} },
  price: { type: Number, required: true, min: 0 },
  compareAtPrice: { type: Number, min: 0 },
  stock: { type: Number, required: true, min: 0, default: 0 },
  reserved: { type: Number, min: 0, default: 0 },
  images: { type: [String], default: undefined },
  warehouseStock: { type: [{ warehouseId: { type: Schema.Types.ObjectId, required: true }, qty: { type: Number, min: 0, default: 0 }, _id: false }], default: undefined },
  barcode: String,
  weightGrams: Number,
  isActive: { type: Boolean, default: true },
});

const productSchema = new Schema<IProduct, ProductModel, IProductMethods>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: '' },
    highlights: { type: [String], default: [] },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    categoryPath: { type: [Schema.Types.ObjectId], default: [] },
    brandId: { type: Schema.Types.ObjectId, ref: 'Brand' },
    brandName: { type: String, trim: true },
    images: { type: [{ url: String, key: String, alt: String, _id: false }], default: [] },
    video: { type: { url: String, key: String, _id: false }, default: undefined },
    attributes: { type: Schema.Types.Mixed, default: {} },
    options: { type: [{ key: String, name: String, values: [String], _id: false }], default: [] },
    variants: { type: [variantSchema], default: [] },
    priceMin: { type: Number, default: 0 },
    priceMax: { type: Number, default: 0 },
    compareAtMax: Number,
    compareAtMin: Number,
    discountPct: { type: Number, default: 0 },
    totalStock: { type: Number, default: 0 },
    status: { type: String, enum: PRODUCT_STATUSES, default: 'draft' },
    moderationNote: String,
    tags: { type: [String], default: [] },
    searchText: { type: String, default: '' },
    cod: { type: Boolean, default: true },
    freeShipping: { type: Boolean, default: false },
    shipping: {
      weightGrams: { type: Number, default: 500 },
      dimensionsCm: { type: { l: Number, w: Number, h: Number, _id: false }, default: undefined },
      processingDays: { type: Number, default: 2 },
    },
    warranty: { type: new Schema({ type: { type: String }, period: String }, { _id: false }), default: undefined },
    returnPolicy: { type: { days: Number, note: String, _id: false }, default: undefined },
    sizeGuide: String,
    specs: { type: [{ label: String, value: String, _id: false }], default: [] },
    wholesaleTiers: { type: [{ minQty: Number, price: Number, _id: false }], default: undefined },
    preOrder: { type: { enabled: Boolean, shipsOn: Date, _id: false }, default: undefined },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },
    wishlistCount: { type: Number, default: 0 },
    isFeatured: { type: Boolean, default: false },
    publishedAt: Date,
    deletedAt: Date,
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, minimize: false },
);

productSchema.index({ storeId: 1, status: 1, createdAt: -1 });
productSchema.index({ status: 1, categoryPath: 1, priceMin: 1 });
productSchema.index({ status: 1, soldCount: -1 });
productSchema.index({ status: 1, publishedAt: -1 });
productSchema.index({ status: 1, ratingAvg: -1 });
productSchema.index({ status: 1, discountPct: -1 });
productSchema.index({ status: 1, priceMin: 1 });
productSchema.index(
  { title: 'text', brandName: 'text', tags: 'text', searchText: 'text' },
  { weights: { title: 10, brandName: 5, tags: 3, searchText: 1 }, name: 'product_text' },
);
productSchema.index({ 'variants.sku': 1, storeId: 1 });
productSchema.index({ 'variants.barcode': 1, storeId: 1 }, { sparse: true });

productSchema.methods.recomputeDerived = function recomputeDerived(this: HydratedDocument<IProduct>) {
  const active = this.variants.filter((v) => v.isActive);
  const pool = active.length ? active : this.variants;
  if (!pool.length) {
    this.priceMin = this.priceMax = this.discountPct = this.totalStock = 0;
    this.compareAtMax = this.compareAtMin = undefined;
    return;
  }
  let min = pool[0]!;
  let max = pool[0]!;
  let discount = 0;
  let compareMax: number | undefined;
  for (const v of pool) {
    if (v.price < min.price) min = v;
    if (v.price > max.price) max = v;
    if (v.compareAtPrice && v.compareAtPrice > v.price) {
      discount = Math.max(discount, Math.round(((v.compareAtPrice - v.price) / v.compareAtPrice) * 100));
      compareMax = Math.max(compareMax ?? 0, v.compareAtPrice);
    }
  }
  this.priceMin = min.price;
  this.priceMax = max.price;
  this.compareAtMax = compareMax;
  this.compareAtMin = min.compareAtPrice && min.compareAtPrice > min.price ? min.compareAtPrice : undefined;
  this.discountPct = discount;
  this.totalStock = active.reduce((sum, v) => sum + Math.max(0, v.stock - (v.reserved ?? 0)), 0);
};

productSchema.pre('save', function preSave(next) {
  this.recomputeDerived();
  next();
});

export const Product = model<IProduct, ProductModel>('Product', productSchema);
export type ProductDoc = HydratedDocument<IProduct, IProductMethods>;
export type ProductLean = IProduct & { _id: Types.ObjectId };
