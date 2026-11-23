import { z } from 'zod';
import { objectIdSchema } from './common';

const limitSchema = z.coerce.number().int().min(1).max(50).default(20);
const cursor = z.string().max(300).optional();
const flag01 = z.enum(['0', '1']).optional().transform((v) => v === '1');

export const slugParamsSchema = z.object({ slug: z.string().trim().toLowerCase().min(1).max(200) });
export const idParamsSchema = z.object({ id: objectIdSchema });
export const pageQuerySchema = z.object({ cursor, limit: limitSchema });

export const SOCIAL_UPLOAD_KINDS = ['review_image', 'review_video', 'chat_image'] as const;
export type SocialUploadKind = (typeof SOCIAL_UPLOAD_KINDS)[number];
export const socialUploadSchema = z.object({ kind: z.enum(SOCIAL_UPLOAD_KINDS) });

// ---------------- Reviews ----------------
export const REVIEW_SORTS = ['recent', 'helpful', 'rating_high', 'rating_low'] as const;
export const REVIEW_STATUSES = ['published', 'hidden', 'pending'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const reviewListQuerySchema = z.object({
  sort: z.enum(REVIEW_SORTS).default('recent'),
  withMedia: flag01,
  rating: z.coerce.number().int().min(1).max(5).optional(),
  cursor,
  limit: limitSchema,
});
export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;

export const reviewMediaInputSchema = z.object({ key: z.string().trim().min(3).max(300), type: z.enum(['image', 'video']) }).strict();
export const reviewCreateSchema = z
  .object({
    orderId: objectIdSchema,
    productId: objectIdSchema,
    variantId: objectIdSchema,
    rating: z.number().int().min(1).max(5),
    title: z.string().trim().max(120).optional(),
    body: z.string().trim().max(3000).optional(),
    media: z
      .array(reviewMediaInputSchema)
      .max(6)
      .refine((m) => m.filter((x) => x.type === 'image').length <= 5, 'At most 5 photos')
      .refine((m) => m.filter((x) => x.type === 'video').length <= 1, 'At most 1 video')
      .optional(),
  })
  .strict();
export type ReviewCreateInput = z.infer<typeof reviewCreateSchema>;

export const reportReasonSchema = z.enum(['spam', 'offensive', 'fake', 'counterfeit', 'prohibited', 'misleading', 'harassment', 'other']);
export const reviewReportSchema = z.object({ reason: reportReasonSchema, details: z.string().trim().max(1000).optional() }).strict();
export const replySchema = z.object({ text: z.string().trim().min(1).max(1000) }).strict();
export const sellerReviewQuerySchema = z.object({
  rating: z.coerce.number().int().min(1).max(5).optional(),
  replied: z.enum(['0', '1']).optional(),
  cursor,
  limit: limitSchema,
});

// ---------------- Q&A ----------------
export const questionCreateSchema = z.object({ text: z.string().trim().min(5).max(500) }).strict();
export const answerSchema = z.object({ text: z.string().trim().min(1).max(1000) }).strict();
export const sellerQuestionQuerySchema = z.object({ unanswered: flag01, cursor, limit: limitSchema });

// ---------------- Wishlists ----------------
export const wishlistNameSchema = z.object({ name: z.string().trim().min(1).max(60) }).strict();
export const wishlistItemSchema = z.object({ productId: objectIdSchema, variantId: objectIdSchema.optional() }).strict();
export const wishlistItemParamsSchema = z.object({ id: objectIdSchema, productId: objectIdSchema });
export const wishlistContainsQuerySchema = z.object({
  productIds: z
    .string()
    .max(25 * 60)
    .transform((s) => [...new Set(s.split(',').map((x) => x.trim()).filter(Boolean))])
    .pipe(z.array(objectIdSchema).max(60)),
});
export const variantQuerySchema = z.object({ variantId: objectIdSchema.optional() });

// ---------------- Alerts ----------------
export const ALERT_TYPES = ['price_drop', 'back_in_stock'] as const;
export type AlertType = (typeof ALERT_TYPES)[number];
export const alertSchema = z.object({ productId: objectIdSchema, variantId: objectIdSchema.optional(), type: z.enum(ALERT_TYPES) }).strict();

// ---------------- Chat ----------------
export const conversationCreateSchema = z
  .object({ storeSlug: z.string().trim().toLowerCase().min(1).max(60), productId: objectIdSchema.optional() })
  .strict();
export const messageCreateSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ type: z.literal('image'), imageKey: z.string().trim().min(3).max(300), text: z.string().trim().max(500).optional() }).strict(),
  z.object({ type: z.literal('product'), productId: objectIdSchema }).strict(),
  z.object({ type: z.literal('order'), orderId: objectIdSchema }).strict(),
]);
export type MessageCreateInput = z.infer<typeof messageCreateSchema>;
export const messageListQuerySchema = z.object({ cursor, limit: z.coerce.number().int().min(1).max(100).default(30) });

// ---------------- Gift cards / reports ----------------
export const giftCardRedeemSchema = z.object({ code: z.string().trim().toUpperCase().min(6).max(40).regex(/^[A-Z0-9-]+$/) }).strict();
export const adminGiftCardCreateSchema = z
  .object({
    amount: z.number().int().min(100).max(10_000_000),
    code: z.string().trim().toUpperCase().min(6).max(40).regex(/^[A-Z0-9-]+$/).optional(),
    expiresAt: z.coerce.date().optional(),
  })
  .strict();

export const REPORT_TARGETS = ['product', 'store', 'review', 'message'] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];
export const reportCreateSchema = z
  .object({ targetType: z.enum(REPORT_TARGETS), targetId: objectIdSchema, reason: reportReasonSchema, details: z.string().trim().max(1000).optional() })
  .strict();
