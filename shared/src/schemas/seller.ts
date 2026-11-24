import { z } from 'zod';
import { SHIPPING_RATE_CAP_MINOR } from '../constants/billing';
import { STORE_PERMISSIONS } from '../constants/permissions';
import { STORE_ROLES } from '../constants/roles';
import { STORE_LAYOUTS, STORE_PLANS, STORE_SECTION_TYPES } from './catalog';
import { addressSchema, cursorQuerySchema, moneyMinorSchema, objectIdSchema } from './common';

/** Phase 5: seller onboarding + Seller Center core (docs/api-seller-orders.md). */

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #0E5E5A');
const media = z.object({ url: z.string().trim().min(1).max(500), key: z.string().trim().min(1).max(300) }).strict();
const phone = z.string().trim().regex(/^\+?[1-9]\d{7,14}$/, 'Enter a valid phone number');
const text = (max: number) => z.string().trim().max(max);

export const storeSlugSchema = z.string().trim().toLowerCase().min(3).max(40);
export const slugAvailableQuerySchema = z.object({ slug: z.string().trim().toLowerCase().min(1).max(60) });

export const BUSINESS_TYPES = ['individual', 'company'] as const;
export const PAYOUT_METHODS = ['bank', 'jazzcash', 'easypaisa'] as const;

export const businessSchema = z
  .object({
    type: z.enum(BUSINESS_TYPES),
    legalName: z.string().trim().min(2).max(120),
    /** CNIC (13 digits, dashes allowed) or company registration number. Encrypted at rest. */
    cnicOrRegNo: z.string().trim().min(5).max(30).regex(/^[A-Za-z0-9-]+$/, 'Letters, digits and dashes only'),
    ntn: z.string().trim().max(20).regex(/^[A-Za-z0-9-]*$/).optional(),
    idDocument: media.optional(),
  })
  .strict();
export type BusinessInput = z.infer<typeof businessSchema>;

export const payoutSchema = z
  .object({
    method: z.enum(PAYOUT_METHODS),
    accountTitle: z.string().trim().min(2).max(100),
    accountNumber: z.string().trim().min(6).max(34).regex(/^[A-Za-z0-9 -]+$/, 'Letters, digits and dashes only'),
    bankName: z.string().trim().max(80).optional(),
    iban: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/, 'Enter a valid IBAN')
      .optional(),
  })
  .strict()
  .refine((p) => p.method !== 'bank' || !!p.bankName, { message: 'Bank name is required', path: ['bankName'] });
export type PayoutInput = z.infer<typeof payoutSchema>;

export const policiesSchema = z.object({ shipping: text(3000).optional(), returns: text(3000).optional(), warranty: text(3000).optional() }).strict();
const contactSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254), phone, whatsapp: phone.optional() }).strict();

export const onboardingSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    slug: storeSlugSchema,
    tagline: text(120).optional(),
    categoryIds: z.array(objectIdSchema).min(1).max(10),
    themeColor: hexColor,
    logo: media.optional(),
    banner: media.optional(),
    contact: contactSchema,
    pickupAddress: addressSchema,
    business: businessSchema,
    payout: payoutSchema,
    policies: policiesSchema.optional(),
    acceptTerms: z.literal(true),
    /** Plan chosen in the wizard (docs/api-billing.md §3): the store starts on Free; a paid choice creates an upgrade invoice. */
    plan: z.enum(STORE_PLANS).optional(),
  })
  .strict();
export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const storeUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    slug: storeSlugSchema,
    tagline: text(120),
    description: text(2000),
    logo: media.nullable(),
    banner: media.nullable(),
    themeColor: hexColor,
    contact: contactSchema.partial().strict(),
    policies: policiesSchema,
    seo: z.object({ title: text(70).optional(), description: text(160).optional() }).strict(),
    layoutTemplate: z.enum(STORE_LAYOUTS),
    sections: z
      .array(z.object({ type: z.enum(STORE_SECTION_TYPES), title: text(80).optional(), config: z.record(z.unknown()).default({}) }).strict())
      .max(20),
    holidayMode: z.object({ enabled: z.boolean(), message: text(200).optional(), until: z.coerce.date().optional() }).strict(),
    categoryIds: z.array(objectIdSchema).min(1).max(10),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type StoreUpdateInput = z.infer<typeof storeUpdateSchema>;

export const storeRejectSchema = z.object({ reason: z.string().trim().min(5).max(500) }).strict();

// ---- dashboard ----
export const DASHBOARD_RANGES = ['7d', '30d', '90d'] as const;
export const dashboardQuerySchema = z.object({ range: z.enum(DASHBOARD_RANGES).default('30d') });

// ---- inventory ----
export const STOCK_ADJUST_REASONS = ['restock', 'damage', 'correction', 'return', 'other'] as const;
/** Every reason a StockMovement can carry (manual adjustments + order / POS flows). */
export const STOCK_MOVEMENT_REASONS = [...STOCK_ADJUST_REASONS, 'sale', 'cancel', 'transfer'] as const;
export type StockMovementReason = (typeof STOCK_MOVEMENT_REASONS)[number];

const bool01 = z
  .union([z.literal('1'), z.literal('0'), z.literal('true'), z.literal('false')])
  .transform((v) => v === '1' || v === 'true');

export const inventoryListQuerySchema = cursorQuerySchema.extend({
  lowStock: bool01.optional(),
  q: z.string().trim().max(100).optional(),
});
export const inventoryAdjustSchema = z
  .object({
    productId: objectIdSchema,
    variantId: objectIdSchema,
    warehouseId: objectIdSchema.optional(),
    delta: z.number().int().min(-1_000_000).max(1_000_000).refine((d) => d !== 0, 'Delta cannot be 0'),
    reason: z.enum(STOCK_ADJUST_REASONS),
    note: text(300).optional(),
  })
  .strict();
export type InventoryAdjustInput = z.infer<typeof inventoryAdjustSchema>;
export const movementsQuerySchema = cursorQuerySchema.extend({ productId: objectIdSchema.optional() });

const warehouseAddress = z
  .object({ line1: text(160).optional(), area: text(80).optional(), city: z.string().trim().min(2).max(60), postalCode: text(12).optional() })
  .strict();
export const warehouseCreateSchema = z.object({ name: z.string().trim().min(2).max(60), address: warehouseAddress, isDefault: z.boolean().default(false) }).strict();
export const warehouseUpdateSchema = z
  .object({ name: z.string().trim().min(2).max(60), address: warehouseAddress, isDefault: z.literal(true) })
  .partial()
  .strict();

// ---- staff & roles ----
const storePermission = z.string().refine((p) => (STORE_PERMISSIONS as string[]).includes(p), 'Unknown store permission');
/** Built-in roles a store can grant (never OWNER; CUSTOM is implied by customRoleId). */
export const INVITABLE_STORE_ROLES = STORE_ROLES.filter((r) => r !== 'OWNER' && r !== 'CUSTOM');
export const staffInviteSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    role: z.enum(INVITABLE_STORE_ROLES as unknown as [string, ...string[]]).optional(),
    customRoleId: objectIdSchema.optional(),
  })
  .strict()
  .refine((v) => !!v.role !== !!v.customRoleId, { message: 'Choose either a role or a custom role', path: ['role'] });
export type StaffInviteInput = z.infer<typeof staffInviteSchema>;
export const staffUpdateSchema = z
  .object({
    role: z.enum(INVITABLE_STORE_ROLES as unknown as [string, ...string[]]).optional(),
    customRoleId: objectIdSchema.optional(),
    status: z.enum(['active', 'disabled']).optional(),
  })
  .strict()
  .refine((v) => !(v.role && v.customRoleId), { message: 'Choose either a role or a custom role', path: ['role'] })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;

export const customRoleSchema = z
  .object({ name: z.string().trim().min(2).max(40), permissions: z.array(storePermission).min(1).max(40) })
  .strict();
export const customRoleUpdateSchema = z
  .object({ name: z.string().trim().min(2).max(40), permissions: z.array(storePermission).min(1).max(40) })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const activityQuerySchema = cursorQuerySchema;

// ---- settings ----
export const shippingZoneSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    cities: z.union([z.literal('all'), z.array(z.string().trim().min(2).max(60)).min(1).max(200)]),
    rate: moneyMinorSchema.max(SHIPPING_RATE_CAP_MINOR, 'Shipping rate is above the Souqly maximum'),
    freeAbove: moneyMinorSchema.optional(),
    etaDays: z.tuple([z.number().int().min(0).max(60), z.number().int().min(0).max(60)]).refine(([a, b]) => a <= b, 'min must be ≤ max'),
  })
  .strict();
export const shippingSettingsSchema = z
  .object({ zones: z.array(shippingZoneSchema).min(1).max(30), processingDays: z.number().int().min(0).max(30) })
  .strict();
export type ShippingSettingsInput = z.infer<typeof shippingSettingsSchema>;

export const notificationSettingsSchema = z
  .object({ newOrderEmail: z.boolean(), newOrderSound: z.boolean(), lowStockEmail: z.boolean(), lowStockThreshold: z.number().int().min(0).max(10_000) })
  .partial()
  .strict();
export const chatSettingsSchema = z
  .object({
    quickReplies: z.array(z.string().trim().min(1).max(300)).max(20),
    autoReply: z.object({ enabled: z.boolean(), message: text(500) }).strict(),
  })
  .partial()
  .strict();
