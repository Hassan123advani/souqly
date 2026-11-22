import { CURRENCIES, type CurrencyCode } from '../constants/locale';

/**
 * All money in Souqly is stored as integer MINOR units (paisa for PKR, halala for SAR, cents for USD).
 * PKR shows 0 decimals, so 229900 paisa => "Rs. 2,299".
 */
export function toMinor(major: number): number {
  return Math.round(major * 100);
}

export function fromMinor(minor: number): number {
  return minor / 100;
}

export function formatMoney(minor: number, currency: CurrencyCode = 'PKR'): string {
  const c = CURRENCIES[currency];
  const value = fromMinor(minor);
  const num = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: c.decimals,
    maximumFractionDigits: c.decimals,
  }).format(c.decimals === 0 ? Math.round(value) : value);
  return c.code === 'USD' ? `${c.symbol}${num}` : `${c.symbol} ${num}`;
}

export function discountPercent(priceMinor: number, compareAtMinor?: number | null): number {
  if (!compareAtMinor || compareAtMinor <= priceMinor) return 0;
  return Math.round(((compareAtMinor - priceMinor) / compareAtMinor) * 100);
}

/** Percentage given in basis points (1% = 100 bps) to avoid floating point drift. */
export function applyBps(amountMinor: number, bps: number): number {
  return Math.round((amountMinor * bps) / 10_000);
}
