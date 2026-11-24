import { z } from 'zod';

export const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');
export const cursorQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});
export const moneyMinorSchema = z.number().int().nonnegative().max(100_000_000_000);

export const addressSchema = z.object({
  label: z.string().trim().max(30).default('Home'),
  fullName: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/),
  country: z.string().length(2).default('PK'),
  city: z.string().trim().min(2).max(60),
  area: z.string().trim().max(80).optional(),
  line1: z.string().trim().min(3).max(160),
  line2: z.string().trim().max(160).optional(),
  postalCode: z.string().trim().max(12).optional(),
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(),
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.infer<typeof addressSchema>;

/** Bodyless mutations (cancel, delete, run sweep): any body field is rejected (security review L11). */
export const emptyBodySchema = z.object({}).strict();
