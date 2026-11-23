import i18n from '@/i18n';
import { getErrorCode, getErrorDetails, getErrorMessage } from '@/api/client';
import { money } from '@/lib/format';

/**
 * Translates an API error using feature keys first (`<prefix>.<CODE>`), falling back to the
 * global `errors.*` handling. `details.minSpend` is formatted as money.
 */
export function featureError(err: unknown, prefix: 'cart.voucherErrors' | 'checkout.errors' | 'orders.errors'): string {
  const code = getErrorCode(err);
  const key = `${prefix}.${code}`;
  if (code && i18n.exists(key)) {
    const minSpend = getErrorDetails(err)?.minSpend;
    return i18n.t(key, { amount: typeof minSpend === 'number' ? money(minSpend) : '' });
  }
  return getErrorMessage(err);
}
