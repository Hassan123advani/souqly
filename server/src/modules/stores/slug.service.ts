import { RESERVED_SLUGS, SLUG_REGEX, slugify, type SlugAvailability } from '@souqly/shared';
import { randomCode } from '../../lib/crypto';
import { Store } from './store.model';

/** Slug rules: SLUG_REGEX (3-40 chars, a-z 0-9 -, no leading/trailing dash), not reserved, not taken. */
export async function checkSlug(raw: string, opts: { ignoreStoreId?: string } = {}): Promise<SlugAvailability> {
  const slug = raw.trim().toLowerCase();
  if (!SLUG_REGEX.test(slug) || slug.includes('--')) return { available: false, reason: 'invalid', suggestion: await suggestSlug(slug) };
  if (RESERVED_SLUGS.has(slug)) return { available: false, reason: 'reserved', suggestion: await suggestSlug(slug) };
  const taken = await Store.exists({ slug, ...(opts.ignoreStoreId ? { _id: { $ne: opts.ignoreStoreId } } : {}) });
  if (taken) return { available: false, reason: 'taken', suggestion: await suggestSlug(slug) };
  return { available: true };
}

async function suggestSlug(raw: string): Promise<string | undefined> {
  const base = (slugify(raw).replace(/-+/g, '-') || 'store').slice(0, 30).replace(/-+$/, '');
  const candidates = [base.length >= 3 && !RESERVED_SLUGS.has(base) ? base : '', ...Array.from({ length: 4 }, () => `${base}-${randomCode(4).toLowerCase()}`)].filter(
    (c) => c && SLUG_REGEX.test(c),
  );
  for (const c of candidates) if (!(await Store.exists({ slug: c }))) return c;
  return undefined;
}
