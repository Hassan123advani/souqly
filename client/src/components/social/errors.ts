import i18n from '@/i18n';
import { getErrorCode, getErrorMessage } from '@/api/client';

/** Translated message for social/loyalty API errors (`social.errors.<CODE>`), else the generic mapping. */
export function socialError(err: unknown): string {
  const code = getErrorCode(err);
  const key = `social.errors.${code}`;
  return code && i18n.exists(key) ? i18n.t(key) : getErrorMessage(err);
}
