import { z } from 'zod';
import { PLATFORM_ROLES } from '../constants/roles';
import { ORDER_STATUSES, PRODUCT_STATUSES, STORE_STATUSES } from '../constants/orders';
import { STORE_PLANS } from './catalog';
import { objectIdSchema } from './common';

/** Shared by every admin list: cursor pagination + optional CSV export. */
export const adminListQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  format: z.enum(['json', 'csv']).default('json'),
});

const isoDate = z.coerce.date();
const boolish = z.enum(['true', 'false']).transform((v) => v === 'true');
const reason = z.string().trim().min(3).max(500);
const localized = (max: number) => z.object({ en: z.string().max(max).default(''), ur: z.string().max(max).default(''), ar: z.string().max(max).default('') });
/** Relative app path or https URL (never javascript:/data:). */
export const safeUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => (v.startsWith('/') && !v.startsWith('//')) || /^https:\/\//i.test(v), 'Use a relative path or an https URL');

export const adminRangeQuerySchema = z.object({ from: isoDate.optional(), to: isoDate.optional() });

// ---- users ----
export const adminUserListQuerySchema = adminListQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  role: z.enum([...PLATFORM_ROLES, 'none']).optional(),
  status: z.enum(['active', 'blocked', 'deleted']).optional(),
  seller: boolish.optional(),
});
export const adminReasonSchema = z.object({ reason }).strict();
export const adminSetRoleSchema = z.object({ platformRole: z.enum(PLATFORM_ROLES).nullable() }).strict();
export const adminWalletAdjustSchema = z
  .object({ amount: z.number().int().refine((n) => n !== 0, 'Amount cannot be 0').refine((n) => Math.abs(n) <= 10_000_000_00, 'Amount too large'), reason })
  .strict();

// ---- stores ----
export const adminStoreListQuerySchema = adminListQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(STORE_STATUSES).optional(),
  mall: boolish.optional(),
  plan: z.enum(STORE_PLANS).optional(),
});
export const adminStoreMallSchema = z.object({ isMall: z.boolean() }).strict();
export const adminStorePlanSchema = z.object({ plan: z.enum(STORE_PLANS) }).strict();
export const adminStoreCommissionSchema = z.object({ bps: z.number().int().min(0).max(10_000).nullable() }).strict();

// ---- products ----
export const adminProductListQuerySchema = adminListQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  storeId: objectIdSchema.optional(),
});
export const adminModerationNoteSchema = z.object({ note: z.string().trim().min(3).max(500) }).strict();
export const adminProductBulkSchema = z
  .object({ ids: z.array(objectIdSchema).min(1).max(100), action: z.enum(['approve', 'reject']), note: z.string().trim().min(3).max(500).optional() })
  .strict()
  .refine((v) => v.action !== 'reject' || !!v.note, { message: 'A note is required to reject', path: ['note'] });
export const adminFeatureSchema = z.object({ isFeatured: z.boolean() }).strict();

// ---- catalog ----
const attributeDef = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,39}$/),
  label: localized(80).extend({ en: z.string().trim().min(1).max(80) }),
  type: z.enum(['text', 'number', 'select', 'multiselect', 'boolean', 'color']),
  options: z.array(z.string().trim().min(1).max(60)).max(100).optional(),
  filterable: z.boolean().default(false),
  variantDefining: z.boolean().default(false),
  unit: z.string().max(20).optional(),
});
export const adminCategoryCreateSchema = z
  .object({
    name: localized(80).extend({ en: z.string().trim().min(1).max(80) }),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
    parentId: objectIdSchema.nullable().default(null),
    icon: z.string().max(40).optional(),
    image: safeUrlSchema.optional(),
    color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    commissionBps: z.number().int().min(0).max(10_000).optional(),
    isActive: z.boolean().default(true),
  })
  .strict();
export const adminCategoryUpdateSchema = adminCategoryCreateSchema.omit({ parentId: true, slug: true }).partial().strict();
export const adminCategoryMoveSchema = z.object({ parentId: objectIdSchema.nullable(), order: z.number().int().min(0).max(10_000).optional() }).strict();
export const adminCategoryReorderSchema = z.object({ parentId: objectIdSchema.nullable(), ids: z.array(objectIdSchema).min(1).max(500) }).strict();
export const adminCategoryAttributesSchema = z.object({ attributes: z.array(attributeDef).max(60) }).strict();
export const adminBrandSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
    logo: safeUrlSchema.optional(),
    description: z.string().max(1000).optional(),
    isFeatured: z.boolean().default(false),
  })
  .strict();

// ---- orders ----
export const adminOrderListQuerySchema = adminListQuerySchema.extend({
  q: z.string().trim().max(60).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  storeId: objectIdSchema.optional(),
  buyerId: objectIdSchema.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export const adminOrderStatusSchema = z.object({ status: z.enum(ORDER_STATUSES), reason }).strict();
export const adminOrderRefundSchema = z.object({ amount: z.number().int().positive(), reason }).strict();

// ---- disputes ----
export const adminDisputeMessageSchema = z.object({ text: z.string().trim().min(1).max(2000) }).strict();
export const adminDisputeResolveSchema = z.object({ outcome: z.enum(['refund_buyer', 'side_with_seller']), note: z.string().trim().min(3).max(2000) }).strict();

// ---- marketing ----
export const adminCampaignSchema = z
  .object({
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
    name: z.string().trim().min(2).max(120),
    theme: z.string().max(40).optional(),
    banner: safeUrlSchema.optional(),
    startsAt: isoDate,
    endsAt: isoDate,
    description: z.string().max(2000).optional(),
    landing: z
      .object({ headline: z.string().max(160).optional(), subheadline: z.string().max(300).optional(), body: z.string().max(20_000).optional(), heroImage: safeUrlSchema.optional() })
      .optional(),
    productIds: z.array(objectIdSchema).max(500).optional(),
    categoryIds: z.array(objectIdSchema).max(100).optional(),
    storeIds: z.array(objectIdSchema).max(200).optional(),
  })
  .strict()
  .refine((v) => v.endsAt > v.startsAt, { message: 'End must be after start', path: ['endsAt'] });
export const adminFlashSaleSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    startsAt: isoDate,
    endsAt: isoDate,
    isActive: z.boolean().default(true),
    items: z
      .array(z.object({ productId: objectIdSchema, variantId: objectIdSchema.optional(), flashPrice: z.number().int().min(0), quantityLimit: z.number().int().min(1).max(100_000).default(100) }))
      .max(200),
  })
  .strict()
  .refine((v) => v.endsAt > v.startsAt, { message: 'End must be after start', path: ['endsAt'] });
export const adminVoucherSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/),
    title: z.string().max(120).optional(),
    type: z.enum(['percent', 'fixed', 'free_shipping']),
    value: z.number().int().min(0),
    minSpend: z.number().int().min(0).default(0),
    maxDiscount: z.number().int().min(0).optional(),
    startsAt: isoDate,
    endsAt: isoDate,
    usageLimit: z.number().int().min(0).default(0),
    perUserLimit: z.number().int().min(1).default(1),
    categoryIds: z.array(objectIdSchema).max(100).default([]),
    productIds: z.array(objectIdSchema).max(500).default([]),
    isActive: z.boolean().default(true),
  })
  .strict()
  .refine((v) => v.endsAt > v.startsAt, { message: 'End must be after start', path: ['endsAt'] })
  .refine((v) => v.type !== 'percent' || v.value <= 10_000, { message: 'Percent is in basis points (max 10000)', path: ['value'] });

// ---- CMS ----
export const adminHomeSchema = z
  .object({
    heroSlides: z
      .array(z.object({ image: safeUrlSchema, title: z.string().max(120), subtitle: z.string().max(200).optional(), ctaText: z.string().max(40).optional(), ctaLink: safeUrlSchema.optional(), theme: z.string().max(20).optional() }))
      .max(12),
    sections: z
      .array(
        z.object({
          type: z.enum(['trending', 'new_arrivals', 'top_rated', 'best_sellers', 'mall', 'top_stores', 'campaign']),
          title: z.string().max(80),
          enabled: z.boolean(),
          config: z.record(z.union([z.string().max(200), z.number(), z.boolean(), z.array(z.string().max(60)).max(50)])).default({}),
        }),
      )
      .max(20),
    featured: z.object({ productIds: z.array(objectIdSchema).max(50).default([]), storeIds: z.array(objectIdSchema).max(50).default([]), categoryIds: z.array(objectIdSchema).max(50).default([]) }).optional(),
  })
  .strict();
export const adminPageSchema = z
  .object({
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
    title: localized(160).extend({ en: z.string().trim().min(1).max(160) }),
    body: localized(100_000),
    published: z.boolean().default(false),
  })
  .strict();
export const adminPageUpdateSchema = z.object({ title: adminPageSchema.shape.title.optional(), body: localized(100_000).optional(), published: z.boolean().optional() }).strict();

// ---- commission ----
export const adminCommissionRuleSchema = z
  .object({
    scope: z.enum(['global', 'category', 'store']),
    categoryId: objectIdSchema.optional(),
    storeId: objectIdSchema.optional(),
    bps: z.number().int().min(0).max(10_000),
    isActive: z.boolean().default(true),
  })
  .strict()
  .refine((v) => (v.scope === 'category' ? !!v.categoryId && !v.storeId : v.scope === 'store' ? !!v.storeId && !v.categoryId : !v.storeId && !v.categoryId), {
    message: 'categoryId / storeId must match the scope',
  });
export const adminCommissionRuleUpdateSchema = z.object({ bps: z.number().int().min(0).max(10_000).optional(), isActive: z.boolean().optional() }).strict();

// ---- finance ----
export const adminPayoutListQuerySchema = adminListQuerySchema.extend({ status: z.enum(['requested', 'approved', 'paid', 'rejected']).optional(), storeId: objectIdSchema.optional() });
export const adminPayoutPaidSchema = z.object({ reference: z.string().trim().min(2).max(120), notes: z.string().max(1000).optional() }).strict();
export const adminPayoutRejectSchema = z.object({ notes: z.string().trim().min(3).max(1000) }).strict();
export const adminFinanceReportQuerySchema = z.object({ from: isoDate.optional(), to: isoDate.optional(), groupBy: z.enum(['day', 'month']).default('day'), format: z.enum(['json', 'csv']).default('json') });

// ---- moderation ----
export const adminReviewListQuerySchema = adminListQuerySchema.extend({ status: z.enum(['published', 'pending', 'hidden']).optional(), storeId: objectIdSchema.optional() });
export const adminReportListQuerySchema = adminListQuerySchema.extend({ status: z.enum(['open', 'reviewing', 'resolved', 'dismissed']).optional() });
export const adminReportResolveSchema = z.object({ action: z.enum(['dismiss', 'hide_target', 'resolved']), note: z.string().trim().max(1000).optional() }).strict();

// ---- support ----
export const TICKET_CATEGORY_VALUES = ['order', 'payment', 'account', 'seller', 'technical', 'other'] as const;
export const ticketCreateSchema = z
  .object({
    subject: z.string().trim().min(3).max(160),
    category: z.enum(TICKET_CATEGORY_VALUES).default('other'),
    body: z.string().trim().min(5).max(5000),
    orderNumber: z.string().trim().max(40).optional(),
  })
  .strict();
export const ticketMessageSchema = z.object({ body: z.string().trim().min(1).max(5000) }).strict();
export const adminTicketListQuerySchema = adminListQuerySchema.extend({
  status: z.enum(['open', 'pending', 'resolved', 'closed']).optional(),
  assigneeId: z.union([objectIdSchema, z.literal('me'), z.literal('none')]).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
});
export const adminTicketAssignSchema = z.object({ assigneeId: objectIdSchema.nullable() }).strict();
export const adminTicketStatusSchema = z.object({ status: z.enum(['open', 'pending', 'resolved', 'closed']).optional(), priority: z.enum(['low', 'normal', 'high', 'urgent']).optional() }).strict();

// ---- email templates ----
export const adminEmailTemplateSchema = z.object({ subject: z.string().trim().min(1).max(200), html: z.string().min(1).max(100_000) }).strict();
export const adminEmailTestSchema = z.object({ to: z.string().trim().email().max(254) }).strict();

// ---- settings ----
export const adminSiteSettingsSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    tagline: z.string().trim().max(120).default(''),
    logoUrl: safeUrlSchema.optional(),
    primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    seo: z.object({ title: z.string().max(70).optional(), description: z.string().max(170).optional(), keywords: z.string().max(300).optional() }).default({}),
    maintenance: z.boolean().default(false),
    maintenanceMessage: z.string().max(300).optional(),
    announcement: z.object({ text: z.string().max(200), link: safeUrlSchema.optional(), tone: z.enum(['info', 'promo', 'warning']).default('info') }).optional(),
    social: z.object({ facebook: safeUrlSchema.optional(), instagram: safeUrlSchema.optional(), x: safeUrlSchema.optional(), youtube: safeUrlSchema.optional(), tiktok: safeUrlSchema.optional() }).default({}),
    supportEmail: z.string().email().max(254).optional(),
    supportPhone: z.string().trim().max(20).optional(),
  })
  .strict();
export const adminFeatureFlagsSchema = z.record(z.string().max(40), z.boolean());
export const adminPaymentMethodsSchema = z.object({ cod: z.boolean(), jazzcash: z.boolean(), easypaisa: z.boolean(), stripe: z.boolean(), wallet: z.boolean() }).strict();
export const adminShippingZonesSchema = z.object({
  zones: z
    .array(z.object({ name: z.string().trim().min(1).max(60), cities: z.array(z.string().trim().min(1).max(60)).max(500), fee: z.number().int().min(0), freeAbove: z.number().int().min(0).optional(), etaDays: z.number().int().min(0).max(60) }))
    .max(50),
});
export const adminTaxSettingsSchema = z
  .object({ display: z.enum(['inclusive', 'exclusive']), rates: z.array(z.object({ country: z.string().length(2).toUpperCase(), bps: z.number().int().min(0).max(10_000) })).max(50) })
  .strict();

// ---- staff / audit ----
export const adminStaffInviteSchema = z.object({ email: z.string().trim().toLowerCase().email(), platformRole: z.enum(PLATFORM_ROLES) }).strict();
export const adminAuditQuerySchema = adminListQuerySchema.extend({
  actorId: objectIdSchema.optional(),
  action: z.string().trim().max(80).optional(),
  targetType: z.string().trim().max(40).optional(),
  targetId: z.string().trim().max(40).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});
