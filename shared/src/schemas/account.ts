import { z } from 'zod';
import { USER_MODES } from '../constants/roles';
import { phoneSchema } from './auth';

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2, 'Name is too short').max(80).optional(),
    phone: phoneSchema.optional(),
  })
  .strict();
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const preferencesSchema = z.object({
  language: z.enum(['en', 'ur', 'ar']),
  currency: z.enum(['PKR', 'SAR', 'AED', 'USD']),
  theme: z.enum(['light', 'dark', 'system']),
  notifications: z.object({ email: z.boolean(), sms: z.boolean(), push: z.boolean(), marketing: z.boolean() }),
  privacy: z.object({ showProfileInReviews: z.boolean(), personalizedRecommendations: z.boolean() }),
});
export type Preferences = z.infer<typeof preferencesSchema>;

/** PATCH /account/preferences — any subset, nested objects may be partial too. */
export const updatePreferencesSchema = z
  .object({
    language: preferencesSchema.shape.language.optional(),
    currency: preferencesSchema.shape.currency.optional(),
    theme: preferencesSchema.shape.theme.optional(),
    notifications: preferencesSchema.shape.notifications.partial().strict().optional(),
    privacy: preferencesSchema.shape.privacy.partial().strict().optional(),
  })
  .strict();
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

export const totpCodeSchema = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code');
export const twoFactorEnableSchema = z.object({ code: totpCodeSchema });
export const twoFactorDisableSchema = z.object({ code: totpCodeSchema, password: z.string().min(1).max(128) });

export const switchModeSchema = z.object({ mode: z.enum(USER_MODES) });

export const revokeAllSessionsSchema = z.object({ includeCurrent: z.boolean().optional().default(false) });

export const deleteAccountSchema = z.object({
  /** Required when the account has a password (phone-OTP-only accounts have none). */
  password: z.string().min(1).max(128).optional(),
  confirm: z.literal('DELETE', { errorMap: () => ({ message: 'Type DELETE to confirm' }) }),
});

export const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) });
