import type { HomeSectionType, StoreLayout, StoreSectionType, AttributeDef } from '../schemas/catalog';
import type { ProductStatus } from '../constants/orders';

/** Catalog / marketplace API response types (docs/api-catalog.md). Money in minor units. */

export type LocalizedName = { en: string; ur: string; ar: string };

export type CategoryNode = {
  id: string;
  slug: string;
  name: LocalizedName;
  icon: string;
  image?: string;
  color?: string;
  order: number;
  children: CategoryNode[];
};

export type Breadcrumb = { slug: string; name: LocalizedName };

export type CategoryFilters = {
  /** Always-available filters on /products. */
  standard: string[];
  /** Filterable attributes (own + inherited from ancestors). */
  attributes: AttributeDef[];
};

export type CategoryDetail = {
  category: { id: string; slug: string; name: LocalizedName; icon: string; image?: string; color?: string; parentId: string | null };
  breadcrumbs: Breadcrumb[];
  children: { id: string; slug: string; name: LocalizedName; icon: string; image?: string }[];
  filters: CategoryFilters;
};

export type BrandDTO = { id: string; name: string; slug: string; logo?: string; description?: string; isFeatured: boolean };

export type ProductCard = {
  id: string;
  slug: string;
  title: string;
  /** Cheapest active in-stock variant (fallback: cheapest active) for quick add-to-cart. */
  defaultVariantId?: string;
  image: string;
  price: number;
  compareAtPrice?: number;
  discountPct: number;
  ratingAvg: number;
  ratingCount: number;
  soldCount: number;
  freeShipping: boolean;
  cod: boolean;
  isMall: boolean;
  store: { slug: string; name: string };
  /** Only present when stock is below 10. */
  stockLeft?: number;
  flash?: { price: number; endsAt: string };
  /** The store is on holiday: product is visible but cannot be bought right now. */
  unavailable?: boolean;
  preOrder?: boolean;
};

export type ProductVariantDTO = {
  id: string;
  sku: string;
  options: Record<string, string>;
  price: number;
  compareAtPrice?: number;
  /** Available = stock - reserved. */
  stock: number;
  images?: string[];
  isActive: boolean;
};

export type StoreSummaryCard = {
  id: string;
  slug: string;
  name: string;
  logo?: string;
  ratingAvg: number;
  followerCount: number;
  responseRate: number;
  isMall: boolean;
  joinedAt: string;
  productCount: number;
  city?: string;
};

export type ProductDetail = {
  id: string;
  slug: string;
  title: string;
  description: string;
  highlights: string[];
  category: { id: string; slug: string; name: LocalizedName } | null;
  brand?: { id?: string; name: string; slug?: string };
  images: { url: string; alt?: string }[];
  video?: { url: string };
  attributes: Record<string, string | string[] | number>;
  options: { key: string; name: string; values: string[] }[];
  variants: ProductVariantDTO[];
  priceMin: number;
  priceMax: number;
  compareAtMax?: number;
  discountPct: number;
  totalStock: number;
  tags: string[];
  cod: boolean;
  freeShipping: boolean;
  shipping: { weightGrams: number; dimensionsCm?: { l: number; w: number; h: number }; processingDays: number };
  warranty?: { type: string; period: string };
  returnPolicy?: { days: number; note?: string };
  sizeGuide?: string;
  specs: { label: string; value: string }[];
  wholesaleTiers?: { minQty: number; price: number }[];
  preOrder?: { enabled: boolean; shipsOn?: string };
  ratingAvg: number;
  ratingCount: number;
  soldCount: number;
  wishlistCount: number;
  publishedAt?: string;
  flash?: { price: number; endsAt: string; variantId?: string };
  unavailable?: boolean;
  holidayMessage?: string;
  store: StoreSummaryCard;
  breadcrumbs: Breadcrumb[];
  /** Phase 10: branded 1200x630 SVG for og:image (D-073). */
  shareImage?: string;
};

/** Seller Center view of a product (includes status and stock details). */
export type SellerProduct = Omit<ProductDetail, 'store' | 'breadcrumbs' | 'category' | 'variants' | 'images' | 'video'> & {
  status: ProductStatus;
  moderationNote?: string;
  categoryId: string;
  images: { url: string; key: string; alt?: string }[];
  video?: { url: string; key: string };
  variants: (ProductVariantDTO & { reserved: number; barcode?: string; weightGrams?: number })[];
  viewCount: number;
  createdAt: string;
  updatedAt: string;
};

export type StoreCard = {
  id: string;
  slug: string;
  name: string;
  tagline?: string;
  logo?: string;
  banner?: string;
  themeColor: string;
  isMall: boolean;
  ratingAvg: number;
  ratingCount: number;
  followerCount: number;
  productCount: number;
  city?: string;
};

export type StorePublic = StoreCard & {
  description?: string;
  categories: { id: string; slug: string; name: LocalizedName }[];
  policies: { shipping?: string; returns?: string; warranty?: string };
  layoutTemplate: StoreLayout;
  sections: { type: StoreSectionType; title?: string; config: Record<string, unknown> }[];
  seo: { title?: string; description?: string };
  holidayMode: { enabled: boolean; message?: string; until?: string };
  responseRate: number;
  responseTimeHours: number;
  contact: { whatsapp?: string };
  joinedAt: string;
  /** Phase 10: branded 1200x630 SVG for og:image (D-073). */
  shareImage?: string;
  /** Phase 10: seller-pinned products for the `featured` section. */
  featuredProductIds?: string[];
};

export type HeroSlide = { image: string; title: string; subtitle?: string; ctaText?: string; ctaLink?: string; theme?: string };

export type HomeSection =
  | { type: Exclude<HomeSectionType, 'top_stores' | 'campaign'>; title: string; items: ProductCard[] }
  | { type: 'top_stores'; title: string; items: StoreCard[] }
  | { type: 'campaign'; title: string; items: CampaignCard[] };

export type CampaignCard = { slug: string; name: string; theme?: string; banner?: string; startsAt: string; endsAt: string; isLive: boolean };

export type FlashSaleDTO = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  items: (ProductCard & { flashPrice: number; quantityLimit: number; sold: number })[];
};

export type HomePayload = {
  heroSlides: HeroSlide[];
  categories: CategoryNode[];
  flashSale: { id: string; title: string; endsAt: string; items: ProductCard[] } | null;
  sections: HomeSection[];
};

export type SearchSuggest = {
  products: { slug: string; title: string; image: string; price: number }[];
  stores: { slug: string; name: string; logo?: string; isMall: boolean }[];
  categories: { slug: string; name: LocalizedName }[];
  didYouMean?: string;
};

export type ProductListMeta = {
  nextCursor: string | null;
  total?: number;
  didYouMean?: string;
  facets?: {
    brands: { slug: string; name: string; count: number }[];
    priceRange: { min: number; max: number };
    ratings: { min: number; count: number }[];
    colors: { value: string; count: number }[];
    sizes: { value: string; count: number }[];
  };
};

export type CampaignDTO = CampaignCard & { description?: string; products: ProductCard[] };

export type UploadResult = { url: string; key: string; kind: 'image' | 'video'; mimetype: string; size: number };
