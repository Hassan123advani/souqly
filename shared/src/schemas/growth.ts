import { z } from 'zod';
import { STORE_PLANS } from './catalog';
import { objectIdSchema } from './common';

/** Phase 10 (seller growth) request schemas. See docs/api-growth.md. */
const date = z.coerce.date();
const money = z.number().int().min(0).max(100_000_000_000);
const window = <T extends z.ZodRawShape>(shape: T) =>
  z
    .object(shape)
    .strict()
    .refine((v) => !(v as { startsAt?: Date; endsAt?: Date }).startsAt || !(v as { endsAt?: Date }).endsAt || (v as { endsAt: Date }).endsAt > (v as { startsAt: Date }).startsAt, {
      message: 'End must be after start',
      path: ['endsAt'],
    });

// ---- Store vouchers ----
const voucherShape = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/, 'Use 3-32 letters, digits, - or _'),
  title: z.string().trim().max(120).optional(),
  type: z.enum(['percent', 'fixed', 'free_shipping']),
  value: z.number().int().min(0).max(100_000_000),
  minSpend: money.default(0),
  maxDiscount: money.optional(),
  startsAt: date,
  endsAt: date,
  usageLimit: z.number().int().min(0).max(1_000_000).default(0),
  perUserLimit: z.number().int().min(1).max(100).default(1),
  followerOnly: z.boolean().default(false),
  categoryIds: z.array(objectIdSchema).max(50).default([]),
  productIds: z.array(objectIdSchema).max(200).default([]),
  isActive: z.boolean().default(true),
};
export const sellerVoucherSchema = window(voucherShape).refine((v) => v.type !== 'percent' || (v.value > 0 && v.value <= 9000), {
  message: 'Percent is in basis points (1-9000)',
  path: ['value'],
});
export const sellerVoucherUpdateSchema = z
  .object({
    title: voucherShape.title,
    value: voucherShape.value.optional(),
    minSpend: money.optional(),
    maxDiscount: money.optional(),
    startsAt: date.optional(),
    endsAt: date.optional(),
    usageLimit: voucherShape.usageLimit.optional(),
    perUserLimit: voucherShape.perUserLimit.optional(),
    followerOnly: z.boolean().optional(),
    categoryIds: voucherShape.categoryIds.optional(),
    productIds: voucherShape.productIds.optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type SellerVoucherInput = z.infer<typeof sellerVoucherSchema>;

// ---- Flash deals ----
export const sellerFlashDealSchema = window({
  title: z.string().trim().min(2).max(120),
  startsAt: date,
  endsAt: date,
  isActive: z.boolean().default(true),
  items: z
    .array(z.object({ productId: objectIdSchema, variantId: objectIdSchema.optional(), price: money, quantityLimit: z.number().int().min(1).max(100_000).default(100) }).strict())
    .min(1)
    .max(100),
});
export type SellerFlashDealInput = z.infer<typeof sellerFlashDealSchema>;

// ---- Bundles ----
export const bundleSchema = window({
  name: z.string().trim().min(2).max(120),
  items: z.array(z.object({ productId: objectIdSchema, variantId: objectIdSchema.optional(), qty: z.number().int().min(1).max(20) }).strict()).min(2).max(6),
  bundlePrice: money.refine((v) => v > 0, 'Bundle price must be positive'),
  isActive: z.boolean().default(true),
  startsAt: date.optional(),
  endsAt: date.optional(),
});
export type BundleInput = z.infer<typeof bundleSchema>;

// ---- Buy X get Y ----
export const promotionSchema = window({
  type: z.literal('bxgy'),
  name: z.string().trim().min(2).max(120),
  buy: z.object({ productIds: z.array(objectIdSchema).min(1).max(100), qty: z.number().int().min(1).max(20) }).strict(),
  get: z.object({ productIds: z.array(objectIdSchema).min(1).max(100), qty: z.number().int().min(1).max(20), discountBps: z.number().int().min(1).max(10_000) }).strict(),
  startsAt: date,
  endsAt: date,
  isActive: z.boolean().default(true),
});
export type PromotionInput = z.infer<typeof promotionSchema>;

export const campaignNominationSchema = z
  .object({ items: z.array(z.object({ productId: objectIdSchema, campaignPrice: money }).strict()).min(1).max(50) })
  .strict();
export const adminNominationReviewSchema = z.object({ status: z.enum(['approved', 'rejected']), note: z.string().trim().max(500).optional() }).strict();
export const featuredProductsSchema = z.object({ productIds: z.array(objectIdSchema).max(12) }).strict();

// ---- Finance ----
export const MIN_PAYOUT_MINOR = 100_000; // Rs. 1,000
export const payoutRequestSchema = z.object({ amount: z.number().int().min(MIN_PAYOUT_MINOR).max(100_000_000_000) }).strict();
export const financeTransactionsQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  type: z.enum(['sale', 'refund', 'payout', 'payout_reversal', 'invoice_payment', 'commission_credit', 'balance_transfer']).optional(),
});
export const statementQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM'),
  format: z.enum(['json', 'pdf', 'csv']).default('json'),
});

// ---- Analytics ----
export const analyticsQuerySchema = z.object({ range: z.enum(['7d', '30d', '90d']).default('30d'), format: z.enum(['json', 'csv', 'pdf']).default('json') });
/** Lenient on purpose (never fails a page view); the server normalises the value (analytics trafficSource). */
export const trafficParamsSchema = z.object({ ref: z.string().max(200).optional(), utm_source: z.string().max(200).optional() });

// ---- POS ----
export const POS_PAYMENT_METHODS = ['cash', 'card', 'wallet'] as const;
export const posSaleSchema = z
  .object({
    clientId: z.string().uuid(),
    createdAt: date,
    items: z.array(z.object({ variantId: objectIdSchema, qty: z.number().int().min(1).max(1000), price: money, discount: money.default(0) }).strict()).min(1).max(200),
    payments: z.array(z.object({ method: z.enum(POS_PAYMENT_METHODS), amount: money }).strict()).min(1).max(5),
    discount: money.default(0),
    customer: z.object({ phone: z.string().trim().max(20).optional(), name: z.string().trim().max(80).optional() }).strict().optional(),
    shiftId: objectIdSchema.optional(),
  })
  .strict();
export type PosSaleInput = z.infer<typeof posSaleSchema>;
export const posSyncSchema = z.object({ sales: z.array(posSaleSchema).min(1).max(50) }).strict();
export const posCatalogQuerySchema = z.object({ updatedSince: z.coerce.date().optional() });
export const posLookupQuerySchema = z.object({ code: z.string().trim().min(1).max(64) });
export const posShiftOpenSchema = z.object({ openingCash: money }).strict();
export const posShiftCloseSchema = z.object({ countedCash: money, note: z.string().trim().max(500).optional() }).strict();

// ---- CSV import ----
export const productImportQuerySchema = z.object({ dryRun: z.enum(['0', '1', 'true', 'false']).optional() });

// ---- Plans ----
export const planRequestSchema = z.object({ plan: z.enum(STORE_PLANS), note: z.string().trim().max(500).optional() }).strict();
export const adminPlanRequestReviewSchema = z.object({ status: z.enum(['approved', 'rejected']), note: z.string().trim().max(500).optional() }).strict();

// ---- Affiliate ----
export const affiliateCodeSchema = z.string().trim().regex(/^[A-Za-z0-9]{4,16}$/, 'Invalid affiliate code');
export const affiliateLinkQuerySchema = z.object({ productId: objectIdSchema });
