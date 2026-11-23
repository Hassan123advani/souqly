import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import type { ZodError } from 'zod';
import { translateError } from '@/lib/validation';

/** Copies a shared-schema ZodError onto react-hook-form fields (dotted paths). Returns the first message. */
export function applyZodErrors<T extends FieldValues>(form: UseFormReturn<T>, error: ZodError, map: Record<string, string> = {}): string | undefined {
  let first: string | undefined;
  for (const issue of error.issues) {
    const raw = issue.path.join('.');
    const path = (map[raw] ?? raw) as Path<T>;
    const message = translateError(issue.message) ?? issue.message;
    first ??= message;
    if (path) form.setError(path, { message });
  }
  return first;
}

/** "12.5" (percent) → 1250 bps; empty → undefined. */
export const pctToBps = (v: string | undefined) => (v === undefined || v.trim() === '' ? undefined : Math.round(Number(v) * 100));
export const bpsToPct = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v / 100));
