import { z } from 'zod';
import { USER_MODES } from '../constants/roles';
import { otpCodeSchema, phoneSchema, secondFactorCodeSchema } from './auth';

/**
 * Re-authentication for sensitive actions: `password` for accounts that have one; passwordless
 * accounts send `otpCode` from POST /account/reauth/otp (sent to their verified phone) instead.
 */
export const reauthFields = {
  password: z.string().min(1, 'Password is required').max(128).optional(),
  otpCode: otpCodeSchema.optional(),
};
export const reauthSchema = z.object(reauthFields);
export type ReauthInput = z.infer<typeof reauthSchema>;

/**
 * PATCH /account/profile. Changing `phone` does not set it: the server stores it as `pendingPhone`
 * and sends an OTP to the new number (confirm with POST /account/phone/verify). Changing the phone
 * needs re-auth (`password` / `otpCode`) when the account already has a password or verified phone.
 */
export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2, 'Name is too short').max(80).optional(),
    phone: phoneSchema.optional(),
    ...reauthFields,
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

/** POST /account/phone/verify — the OTP sent to `pendingPhone`. */
export const phoneVerifySchema = z.object({ code: otpCodeSchema });

export const totpCodeSchema = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code');
/** POST /account/2fa/setup — re-auth required (password, or otpCode for passwordless accounts). */
export const twoFactorSetupSchema = reauthSchema;
/** POST /account/2fa/enable — returns 8 recovery codes ONCE. */
export const twoFactorEnableSchema = z.object({ code: totpCodeSchema, ...reauthFields });
/** POST /account/2fa/disable — `code` may be an authenticator code or a recovery code. */
export const twoFactorDisableSchema = z.object({ code: secondFactorCodeSchema, ...reauthFields });

export const switchModeSchema = z.object({ mode: z.enum(USER_MODES) });

export const revokeAllSessionsSchema = z.object({ includeCurrent: z.boolean().optional().default(false) });

export const deleteAccountSchema = z.object({
  /** Required when the account has a password; passwordless accounts send `otpCode` instead. */
  ...reauthFields,
  confirm: z.literal('DELETE', { errorMap: () => ({ message: 'Type DELETE to confirm' }) }),
});

export const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) });
