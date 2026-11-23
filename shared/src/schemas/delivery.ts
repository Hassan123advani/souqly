import { z } from 'zod';
import { cursorQuerySchema, moneyMinorSchema, objectIdSchema } from './common';

// ---------- notifications / push ----------
export const notificationListQuerySchema = cursorQuerySchema.extend({
  unread: z.enum(['0', '1', 'true', 'false']).optional(),
});
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export const pushSubscriptionSchema = z
  .object({
    endpoint: z.string().url().max(1000).refine((u) => u.startsWith('https://'), 'Push endpoint must be https'),
    keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }).strict(),
    expirationTime: z.number().nullable().optional(),
  })
  .strict();
export const pushUnsubscribeSchema = z.object({ endpoint: z.string().url().max(1000) }).strict();

// ---------- rider ----------
export const RIDER_DELIVERY_RANGES = ['today', 'upcoming', 'history'] as const;
export const riderDeliveryListQuerySchema = cursorQuerySchema.extend({ date: z.enum(RIDER_DELIVERY_RANGES).default('today') });
export type RiderDeliveryListQuery = z.infer<typeof riderDeliveryListQuerySchema>;

export const riderLocationSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(100_000).optional(),
    heading: z.number().min(0).max(360).optional(),
    speed: z.number().min(0).max(100).optional(),
  })
  .strict();
export type RiderLocationInput = z.infer<typeof riderLocationSchema>;
export const riderSocketLocationSchema = riderLocationSchema.extend({ orderId: objectIdSchema }).strict();

export const deliverSchema = z
  .object({
    otp: z.string().regex(/^\d{4}$/, 'Enter the 4-digit delivery code'),
    codCollected: moneyMinorSchema.optional(),
    photoRef: z.string().max(1000).optional(),
  })
  .strict();
export type DeliverInput = z.infer<typeof deliverSchema>;

export const DELIVERY_FAIL_REASONS = ['customer_unavailable', 'wrong_address', 'refused', 'other'] as const;
export type DeliveryFailReason = (typeof DELIVERY_FAIL_REASONS)[number];
export const deliveryFailSchema = z
  .object({ reason: z.enum(DELIVERY_FAIL_REASONS), note: z.string().trim().max(500).optional() })
  .strict()
  .refine((v) => v.reason !== 'other' || !!v.note, { message: 'Add a note', path: ['note'] });

export const codSettleSchema = z.object({ amount: moneyMinorSchema.refine((v) => v > 0, 'Amount must be positive') }).strict();
export const riderSettingsSchema = z.object({ riderFee: moneyMinorSchema.refine((v) => v <= 10_000_00, 'Too high') }).strict();
export const orderTrackJoinSchema = z.object({ orderId: objectIdSchema }).strict();

// ---------- returns ----------
export const RETURN_REASONS = ['damaged', 'wrong_item', 'not_as_described', 'size_issue', 'changed_mind', 'other'] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];
export const RETURN_STATUSES = ['requested', 'approved', 'rejected', 'received', 'refunded', 'escalated'] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];
export const DEFAULT_RETURN_DAYS = 7;
export const MAX_RETURN_PHOTOS = 5;

export const createReturnSchema = z
  .object({
    items: z
      .array(z.object({ variantId: objectIdSchema, qty: z.number().int().min(1).max(1000), reason: z.enum(RETURN_REASONS).optional() }).strict())
      .min(1)
      .max(50),
    reason: z.enum(RETURN_REASONS),
    description: z.string().trim().max(2000).default(''),
    photos: z.array(z.string().max(1000)).max(MAX_RETURN_PHOTOS).default([]),
  })
  .strict();
export type CreateReturnInput = z.infer<typeof createReturnSchema>;

export const returnListQuerySchema = cursorQuerySchema.extend({ status: z.enum(RETURN_STATUSES).optional() });
export type ReturnListQuery = z.infer<typeof returnListQuerySchema>;
export const returnNoteSchema = z.object({ note: z.string().trim().max(1000).optional() }).strict();
export const returnRejectSchema = z.object({ note: z.string().trim().min(3).max(1000) }).strict();
export const returnEscalateSchema = z.object({ message: z.string().trim().min(5).max(2000) }).strict();
