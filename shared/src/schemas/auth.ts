import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number');
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{7,14}$/, 'Enter a valid phone number with country code, e.g. +923001234567');

export const signupSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(80),
  email: emailSchema,
  password: passwordSchema,
  referralCode: z.string().trim().max(20).optional(),
});
export type SignupInput = z.infer<typeof signupSchema>;

/** Second factor: a 6-digit authenticator code OR a single-use recovery code (`XXXXX-XXXXX`). */
export const secondFactorCodeSchema = z
  .string()
  .trim()
  .regex(/^(\d{6}|[A-Za-z0-9]{5}-?[A-Za-z0-9]{5})$/, 'Enter the 6-digit code or a recovery code');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(128),
  totp: secondFactorCodeSchema.optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const otpRequestSchema = z.object({ phone: phoneSchema });
export const otpCodeSchema = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code');
export const otpVerifySchema = z.object({ phone: phoneSchema, code: otpCodeSchema, totp: secondFactorCodeSchema.optional() });

/** POST /auth/google/2fa — `ticket` comes from the `google2fa` query param of /login. */
export const googleTwoFactorSchema = z.object({ ticket: z.string().min(20).max(200), totp: secondFactorCodeSchema });
export type GoogleTwoFactorInput = z.infer<typeof googleTwoFactorSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(200), password: passwordSchema });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] })
  .refine((d) => d.newPassword !== d.currentPassword, { message: 'New password must be different', path: ['newPassword'] });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const changeEmailSchema = z.object({ newEmail: emailSchema, password: z.string().min(1).max(128) });

/** 0..4 strength score used by the password strength meter. */
export function passwordStrength(pw: string): 0 | 1 | 2 | 3 | 4 {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4) as 0 | 1 | 2 | 3 | 4;
}
