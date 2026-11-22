import { z } from 'zod';
import i18n from '@/i18n';

/**
 * Shared Zod schemas live in @souqly/shared with English messages. On the client we:
 *  1. install a global error map so built-in issues (too_small, invalid email...) are translated, and
 *  2. map the schemas' custom English messages to translation keys.
 */
const CUSTOM: Record<string, string> = {
  'Enter a valid email address': 'validation.email',
  'Use at least 8 characters': 'validation.passwordMin',
  'Include at least one letter': 'validation.passwordLetter',
  'Include at least one number': 'validation.passwordNumber',
  'Enter a valid phone number with country code, e.g. +923001234567': 'validation.phone',
  'Name is too short': 'validation.nameShort',
  'Password is required': 'validation.passwordRequired',
  'Enter the 6-digit code': 'validation.code',
  'Passwords do not match': 'validation.passwordMismatch',
  'New password must be different': 'validation.passwordSame',
};

export function translateError(message?: string): string | undefined {
  if (!message) return undefined;
  const key = CUSTOM[message];
  if (key) return i18n.t(key);
  if (message.startsWith('validation.')) return i18n.t(message);
  return message;
}

let installed = false;
export function installZodErrorMap() {
  if (installed) return;
  installed = true;
  z.setErrorMap((issue, ctx) => {
    switch (issue.code) {
      case z.ZodIssueCode.invalid_type:
        if (issue.received === 'undefined' || issue.received === 'null') return { message: i18n.t('validation.required') };
        break;
      case z.ZodIssueCode.too_small:
        if (issue.type === 'string') {
          return { message: issue.minimum === 1 ? i18n.t('validation.required') : i18n.t('validation.tooShort', { min: issue.minimum }) };
        }
        break;
      case z.ZodIssueCode.too_big:
        if (issue.type === 'string') return { message: i18n.t('validation.tooLong', { max: issue.maximum }) };
        break;
      case z.ZodIssueCode.invalid_string:
        if (issue.validation === 'email') return { message: i18n.t('validation.email') };
        return { message: i18n.t('validation.format') };
      default:
        break;
    }
    return { message: ctx.defaultError };
  });
}
