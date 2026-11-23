import type { FieldErrors, FieldValues } from 'react-hook-form';
import { translateError } from '@/lib/validation';

/** Translated error message at a dotted path (`business.legalName`) of RHF errors. */
export function fieldError(errors: FieldErrors<FieldValues>, path: string): string | undefined {
  let cur: unknown = errors;
  for (const part of path.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  const msg = (cur as { message?: unknown } | undefined)?.message;
  return typeof msg === 'string' ? translateError(msg) : undefined;
}
