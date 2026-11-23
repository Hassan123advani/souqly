import { z } from 'zod';
import { PRODUCT_STATUSES } from '../constants/orders';
import { moneyMinorSchema, objectIdSchema } from './common';

/** Catalog schemas (docs/api-catalog.md). Shared by the Seller Center forms and the server. */

export const ATTRIBUTE_TYPES = ['text', 'number', 'select', 'multiselect', 'color', 'size'] as const;
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];

export const PRODUCT_SORTS = ['relevance', 'newest', 'price_asc', 'price_desc', 'best_selling', 'top_rated', 'discount'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const STORE_SORTS = ['followers', 'rating', 'new'] as const;
export type StoreSort = (typeof STORE_SORTS)[number];

export const STORE_LAYOUTS = ['classic', 'bold', 'boutique', 'minimal'] as const;
export type StoreLayout = (typeof STORE_LAYOUTS)[number];

export const STORE_SECTION_TYPES = ['hero', 'featured', 'category_row', 'deals', 'new_arrivals', 'best_sellers', 'banner', 'text'] as const;
export type StoreSectionType = (typeof STORE_SECTION_TYPES)[number];

export const STORE_PLANS = ['free', 'pro', 'business'] as const;
export type StorePlan = (typeof STORE_PLANS)[number];

export const HOME_SECTION_TYPES = ['trending', 'new_arrivals', 'top_rated', 'best_sellers', 'mall', 'top_stores', 'campaign'] as const;
export type HomeSectionType = (typeof HOME_SECTION_TYPES)[number];

/** Keys used in `attributes`, option keys and `attrs[key]` filters. */
export const attributeKeySchema = z.string().regex(/^[a-z][a-z0-9_]{0,31}$/, 'Use lowercase letters, digits and _');

export const localizedNameSchema = z.object({
  en: z.string().trim().min(1).max(80),
  ur: z.string().trim().max(80).default(''),
  ar: z.string().trim().max(80).default(''),
});

export const attributeDefSchema = z.object({
  key: attributeKeySchema,
  label: localizedNameSchema,
  type: z.enum(ATTRIBUTE_TYPES),
  options: z.array(z.string().trim().min(1).max(40)).max(60).optional(),
  filterable: z.boolean().default(false),
  variantDefining: z.boolean().default(false),
  unit: z.string().trim().max(12).optional(),
});
export type AttributeDef = z.infer<typeof attributeDefSchema>;

export const categoryInputSchema = z.object({
  name: localizedNameSchema,
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/),
  parentId: objectIdSchema.nullable().default(null),
  icon: z.string().trim().max(40).default('Tag'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  order: z.number().int().min(0).max(10_000).default(0),
  attributes: z.array(attributeDefSchema).max(30).default([]),
  commissionBps: z.number().int().min(0).max(5000).optional(),
  isActive: z.boolean().default(true),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const brandInputSchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/),
  description: z.string().trim().max(500).optional(),
  isFeatured: z.boolean().default(false),
});
export type BrandInput = z.infer<typeof brandInputSchema>;

// ---------------------------------------------------------------------------------------------
// Product (seller create / update)
// ---------------------------------------------------------------------------------------------

/** Media must come from our own storage: local `/uploads/...` or an https URL (Cloudinary). */
const mediaUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((u) => /^\/uploads\/[A-Za-z0-9/_.-]+$/.test(u) || /^https:\/\/[A-Za-z0-9.-]+\/[^\s"'<>]*$/.test(u), 'Invalid media URL');

export const productImageSchema = z.object({
  url: mediaUrlSchema,
  key: z.string().trim().min(1).max(300),
  alt: z.string().trim().max(150).optional(),
});

export const productOptionSchema = z.object({
  key: attributeKeySchema,
  name: z.string().trim().min(1).max(30),
  values: z.array(z.string().trim().min(1).max(40)).min(1).max(30),
});

export const productVariantInputSchema = z.object({
  /** Existing variant id (keeps cart/order references stable when editing). */
  id: objectIdSchema.optional(),
  sku: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/).optional(),
  options: z.record(attributeKeySchema, z.string().trim().min(1).max(40)).default({}),
  price: moneyMinorSchema.refine((v) => v > 0, 'Price must be greater than 0'),
  compareAtPrice: moneyMinorSchema.optional(),
  stock: z.number().int().min(0).max(1_000_000),
  images: z.array(mediaUrlSchema).max(5).optional(),
  barcode: z.string().trim().max(64).optional(),
  weightGrams: z.number().int().min(0).max(1_000_000).optional(),
  isActive: z.boolean().default(true),
});
export type ProductVariantInput = z.infer<typeof productVariantInputSchema>;

const attributeValueSchema = z.union([
  z.string().trim().max(200),
  z.array(z.string().trim().max(60)).max(30),
  z.number().finite(),
]);

const productBaseSchema = z.object({
  title: z.string().trim().min(3).max(150),
  description: z.string().max(20_000).default(''),
  highlights: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  categoryId: objectIdSchema,
  brandId: objectIdSchema.optional(),
  brandName: z.string().trim().max(60).optional(),
  images: z.array(productImageSchema).max(10).default([]),
  video: z.object({ url: mediaUrlSchema, key: z.string().trim().min(1).max(300) }).optional(),
  attributes: z
    .record(attributeKeySchema, attributeValueSchema)
    .refine((r) => Object.keys(r).length <= 30, 'Too many attributes')
    .default({}),
  options: z.array(productOptionSchema).max(3).default([]),
  variants: z.array(productVariantInputSchema).min(1).max(200),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(20).default([]),
  cod: z.boolean().default(true),
  freeShipping: z.boolean().default(false),
  shipping: z
    .object({
      weightGrams: z.number().int().min(0).max(1_000_000).default(500),
      dimensionsCm: z
        .object({ l: z.number().min(0).max(1000), w: z.number().min(0).max(1000), h: z.number().min(0).max(1000) })
        .optional(),
      processingDays: z.number().int().min(0).max(30).default(2),
    })
    .default({}),
  warranty: z.object({ type: z.enum(['none', 'seller', 'brand']), period: z.string().trim().max(40) }).optional(),
  returnPolicy: z.object({ days: z.number().int().min(0).max(90), note: z.string().trim().max(300).optional() }).optional(),
  sizeGuide: z.string().max(10_000).optional(),
  specs: z.array(z.object({ label: z.string().trim().min(1).max(60), value: z.string().trim().min(1).max(200) })).max(40).default([]),
  wholesaleTiers: z.array(z.object({ minQty: z.number().int().min(2).max(100_000), price: moneyMinorSchema })).max(5).optional(),
  preOrder: z.object({ enabled: z.boolean(), shipsOn: z.coerce.date().optional() }).optional(),
});

type VariantCheckInput = {
  options?: { key: string; name?: string; values: string[] }[];
  variants?: { options: Record<string, string>; price: number; compareAtPrice?: number }[];
  wholesaleTiers?: { minQty: number; price: number }[];
};

/** Cross-field rules shared by create and update. */
export function checkProductVariants(p: VariantCheckInput, ctx: z.RefinementCtx): void {
  const options = p.options;
  if (options) {
    const keys = options.map((o) => o.key);
    if (new Set(keys).size !== keys.length) ctx.addIssue({ code: 'custom', path: ['options'], message: 'Duplicate option keys' });
  }
  if (!p.variants) return;
  const seen = new Set<string>();
  p.variants.forEach((v, i) => {
    if (v.compareAtPrice !== undefined && v.compareAtPrice <= v.price) {
      ctx.addIssue({ code: 'custom', path: ['variants', i, 'compareAtPrice'], message: 'Compare-at price must be higher than the price' });
    }
    if (options) {
      const vk = Object.keys(v.options).sort();
      const ok = options.map((o) => o.key).sort();
      if (vk.join('|') !== ok.join('|')) {
        ctx.addIssue({ code: 'custom', path: ['variants', i, 'options'], message: 'Variant must set exactly one value for each option' });
      } else {
        for (const o of options) {
          if (!o.values.includes(v.options[o.key]!)) {
            ctx.addIssue({ code: 'custom', path: ['variants', i, 'options', o.key], message: `Unknown value for ${o.name ?? o.key}` });
          }
        }
      }
    }
    const combo = JSON.stringify(Object.entries(v.options).sort(([a], [b]) => a.localeCompare(b)));
    if (seen.has(combo)) ctx.addIssue({ code: 'custom', path: ['variants', i], message: 'Duplicate variant' });
    seen.add(combo);
  });
  if (p.wholesaleTiers) {
    const qtys = p.wholesaleTiers.map((t) => t.minQty);
    if (new Set(qtys).size !== qtys.length) ctx.addIssue({ code: 'custom', path: ['wholesaleTiers'], message: 'Duplicate tier quantity' });
  }
}

export const productCreateSchema = productBaseSchema.strict().superRefine(checkProductVariants);
export type ProductCreateInput = z.infer<typeof productCreateSchema>;

/** PATCH: any subset. If `variants` is sent without `options`, the server checks them against the stored options. */
export const productUpdateSchema = productBaseSchema
  .partial()
  .strict()
  .superRefine((p, ctx) => {
    if (p.variants && p.options) checkProductVariants(p, ctx);
    else if (p.variants) checkProductVariants({ variants: p.variants, wholesaleTiers: p.wholesaleTiers }, ctx);
  });
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

export const sellerProductListQuerySchema = z.object({
  status: z.enum(PRODUCT_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().max(400).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});
export type SellerProductListQuery = z.infer<typeof sellerProductListQuerySchema>;
/** POST /seller/products/bulk */
export const sellerProductBulkSchema = z.object({ ids: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).min(1).max(100), action: z.enum(['publish', 'archive']) }).strict();
export type SellerProductBulkInput = z.infer<typeof sellerProductBulkSchema>;
export type SellerProductBulkResult = { ok: string[]; failed: { id: string; code: string; message: string }[] };

// ---------------------------------------------------------------------------------------------
// Public listing queries
// ---------------------------------------------------------------------------------------------

/** Query-string boolean: `1|true|0|false`. */
const qBool = z.enum(['1', 'true', '0', 'false']).transform((v) => v === '1' || v === 'true');
const csv = (max = 20) =>
  z
    .string()
    .max(600)
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, max),
    );

export const productListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().toLowerCase().max(80).optional(),
  brand: csv().optional(),
  store: z.string().trim().toLowerCase().max(60).optional(),
  priceMin: z.coerce.number().int().min(0).max(100_000_000_000).optional(),
  priceMax: z.coerce.number().int().min(0).max(100_000_000_000).optional(),
  rating: z.coerce.number().min(0).max(5).optional(),
  city: z.string().trim().max(60).optional(),
  freeShipping: qBool.optional(),
  cod: qBool.optional(),
  discount: z.coerce.number().int().min(0).max(100).optional(),
  inStock: qBool.optional(),
  mall: qBool.optional(),
  color: csv().optional(),
  size: csv().optional(),
  /** `attrs[key]=v1,v2` (express `qs` parses this into an object). */
  attrs: z.record(attributeKeySchema, z.string().max(200)).refine((r) => Object.keys(r).length <= 10).optional(),
  sort: z.enum(PRODUCT_SORTS).default('relevance'),
  facets: qBool.optional(),
  cursor: z.string().max(400).optional(),
  limit: z.coerce.number().int().min(1).max(60).default(24),
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const storeListQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  mall: qBool.optional(),
  sort: z.enum(STORE_SORTS).default('followers'),
  cursor: z.string().max(400).optional(),
  limit: z.coerce.number().int().min(1).max(60).default(24),
});
export type StoreListQuery = z.infer<typeof storeListQuerySchema>;

export const searchSuggestQuerySchema = z.object({ q: z.string().trim().min(1).max(100) });

export const feedQuerySchema = z.object({
  cursor: z.string().max(400).optional(),
  limit: z.coerce.number().int().min(1).max(60).default(24),
});

export const brandListQuerySchema = z.object({ featured: qBool.optional() });
