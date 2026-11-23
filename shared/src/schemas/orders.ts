import { z } from 'zod';
import { BUYER_ORDER_TABS, ORDER_STATUSES, PAYMENT_METHODS } from '../constants/orders';
import { cursorQuerySchema, objectIdSchema } from './common';

/** Max quantity of a single cart line (anti-abuse; wholesale buyers still fit). */
export const CART_MAX_QTY = 999;
/** Max distinct lines in a cart. */
export const CART_MAX_ITEMS = 100;

const qtySchema = z.number().int().min(1).max(CART_MAX_QTY);

export const cartAddItemSchema = z
  .object({ productId: objectIdSchema, variantId: objectIdSchema, qty: qtySchema.default(1) })
  .strict();
export type CartAddItemInput = z.infer<typeof cartAddItemSchema>;

export const cartUpdateItemSchema = z
  .object({ qty: qtySchema.optional(), selected: z.boolean().optional(), savedForLater: z.boolean().optional() })
  .strict()
  .refine((v) => v.qty !== undefined || v.selected !== undefined || v.savedForLater !== undefined, 'Nothing to update');
export type CartUpdateItemInput = z.infer<typeof cartUpdateItemSchema>;

export const cartSelectAllSchema = z.object({ selected: z.boolean() }).strict();

export const cartMergeSchema = z
  .object({
    items: z
      .array(z.object({ productId: objectIdSchema, variantId: objectIdSchema, qty: qtySchema }).strict())
      .max(CART_MAX_ITEMS),
  })
  .strict();
export type CartMergeInput = z.infer<typeof cartMergeSchema>;

export const voucherCodeSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[A-Za-z0-9_-]+$/, 'Invalid voucher code')
  .transform((s) => s.toUpperCase());

export const cartVoucherSchema = z.object({ code: voucherCodeSchema }).strict();
export const cartVoucherParamsSchema = z.object({ code: voucherCodeSchema });

/** Per-store buyer notes, keyed by storeId. */
const notesSchema = z
  .record(objectIdSchema, z.string().trim().max(500))
  .refine((r) => Object.keys(r).length <= 50, 'Too many notes')
  .optional();

export const checkoutPreviewSchema = z
  .object({
    addressId: objectIdSchema,
    paymentMethod: z.enum(PAYMENT_METHODS),
    notes: notesSchema,
    coins: z.number().int().min(0).max(1_000_000).optional(),
  })
  .strict();
export type CheckoutPreviewInput = z.infer<typeof checkoutPreviewSchema>;

export const checkoutSchema = z
  .object({
    addressId: objectIdSchema,
    paymentMethod: z.enum(PAYMENT_METHODS),
    notes: notesSchema,
    coins: z.number().int().min(0).max(1_000_000).optional(),
    idempotencyKey: z.string().trim().min(8).max(100).regex(/^[A-Za-z0-9_:-]+$/, 'Invalid idempotency key'),
  })
  .strict();
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const orderNumberParamsSchema = z.object({ number: z.string().trim().regex(/^SQ-\d{6}-[A-Z0-9]{5}(-[A-Z]{1,2})?$/, 'Invalid order number') });
export const checkoutNumberParamsSchema = z.object({ number: z.string().trim().regex(/^SQ-\d{6}-[A-Z0-9]{5}$/, 'Invalid checkout number') });

export const buyerOrderListQuerySchema = cursorQuerySchema.extend({
  tab: z.enum(Object.keys(BUYER_ORDER_TABS) as [keyof typeof BUYER_ORDER_TABS, ...(keyof typeof BUYER_ORDER_TABS)[]]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type BuyerOrderListQuery = z.infer<typeof buyerOrderListQuerySchema>;

export const orderCancelSchema = z.object({ reason: z.string().trim().min(3).max(300) }).strict();

export const sellerOrderListQuerySchema = cursorQuerySchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  q: z.string().trim().max(80).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type SellerOrderListQuery = z.infer<typeof sellerOrderListQuerySchema>;

/** Statuses a seller may move an order to (later statuses belong to riders / returns flows). */
export const SELLER_TARGET_STATUSES = ['confirmed', 'packed', 'shipped', 'cancelled'] as const;
export type SellerTargetStatus = (typeof SELLER_TARGET_STATUSES)[number];

export const sellerOrderStatusSchema = z
  .object({
    to: z.enum(SELLER_TARGET_STATUSES),
    note: z.string().trim().max(500).optional(),
    reason: z.string().trim().min(3).max(300).optional(),
    tracking: z
      .object({ courier: z.string().trim().min(2).max(60), trackingNumber: z.string().trim().min(3).max(60) })
      .strict()
      .optional(),
  })
  .strict()
  .refine((v) => v.to !== 'cancelled' || !!v.reason, { message: 'A reason is required to cancel', path: ['reason'] });
export type SellerOrderStatusInput = z.infer<typeof sellerOrderStatusSchema>;

export const sellerBulkStatusSchema = z
  .object({
    ids: z.array(objectIdSchema).min(1).max(100),
    to: z.enum(['confirmed', 'packed'] as const),
  })
  .strict();
export type SellerBulkStatusInput = z.infer<typeof sellerBulkStatusSchema>;

export const orderNoteSchema = z.object({ text: z.string().trim().min(1).max(1000) }).strict();
export const assignRiderSchema = z.object({ riderMemberId: objectIdSchema }).strict();
