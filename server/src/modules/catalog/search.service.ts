import { Types } from 'mongoose';
import { TtlCache } from '../../lib/cache';
import { logger } from '../../lib/logger';
import { levenshtein, normalizeText, tokenize } from '../../lib/text';
import { Store } from '../stores/store.model';
import { Brand } from './brand.model';
import { Category } from './category.model';
import { SearchLog } from './marketing.models';
import { Product } from './product.model';

/**
 * Search vocabulary for "did you mean" (D-008): category names, brand names, store names and
 * title tokens of published products, with frequencies. Rebuilt at most every 10 minutes.
 */
const vocabCache = new TtlCache<Map<string, number>>(10 * 60_000, 1);

export async function getVocabulary(): Promise<Map<string, number>> {
  return vocabCache.get('vocab', async () => {
    const vocab = new Map<string, number>();
    const add = (text: string, weight = 1) => {
      for (const t of tokenize(text, 3)) vocab.set(t, (vocab.get(t) ?? 0) + weight);
    };
    const [cats, brands, stores, products] = await Promise.all([
      Category.find({ isActive: true }).select('name').lean(),
      Brand.find().select('name').lean(),
      Store.find({ status: 'approved' }).select('name').lean(),
      Product.find({ status: 'published', deletedAt: { $exists: false } }).select('title tags').limit(20_000).lean(),
    ]);
    for (const c of cats) add(c.name.en, 5);
    for (const b of brands) add(b.name, 3);
    for (const s of stores) add(s.name, 3);
    for (const p of products) {
      add(p.title);
      for (const t of p.tags ?? []) add(t);
    }
    return vocab;
  });
}

export function invalidateVocabulary(): void {
  vocabCache.clear();
}

/** Replaces unknown tokens with the closest vocabulary word (Levenshtein ≤ 2; ≤ 1 for short tokens). */
export async function didYouMean(q: string): Promise<string | undefined> {
  const tokens = normalizeText(q).split(' ').filter(Boolean);
  if (!tokens.length) return undefined;
  const vocab = await getVocabulary();
  let changed = false;
  const out = tokens.map((tok) => {
    if (tok.length < 3 || vocab.has(tok)) return tok;
    const max = tok.length <= 4 ? 1 : 2;
    let best: { word: string; d: number; f: number } | undefined;
    for (const [word, f] of vocab) {
      if (Math.abs(word.length - tok.length) > max) continue;
      const d = levenshtein(tok, word, max);
      if (d > max) continue;
      if (!best || d < best.d || (d === best.d && f > best.f)) best = { word, d, f };
    }
    if (best) {
      changed = true;
      return best.word;
    }
    return tok;
  });
  return changed ? out.join(' ') : undefined;
}

// ---------------------------------------------------------------------------------------------
// Logs, trending, history
// ---------------------------------------------------------------------------------------------

export function logSearch(q: string, resultCount: number, userId?: string): void {
  const normalized = normalizeText(q).slice(0, 100);
  if (!normalized) return;
  SearchLog.create({
    q: q.slice(0, 100),
    normalized,
    resultCount,
    ...(userId ? { userId: new Types.ObjectId(userId) } : {}),
  }).catch((err) => logger.warn({ err }, 'Failed to write search log'));
}

export const CURATED_TRENDING = ['lawn suit', 'wireless earbuds', 'smart watch', 'kurta', 'non stick cookware', 'school bag', 'cricket bat', 'perfume'];

const trendingCache = new TtlCache<string[]>(5 * 60_000, 1);

export async function trendingSearches(): Promise<string[]> {
  return trendingCache.get('trending', async () => {
    const since = new Date(Date.now() - 7 * 24 * 3600_000);
    const rows = await SearchLog.aggregate<{ _id: string; n: number }>([
      { $match: { createdAt: { $gte: since }, resultCount: { $gt: 0 } } },
      { $group: { _id: '$normalized', n: { $sum: 1 } } },
      { $match: { n: { $gte: 2 } } },
      { $sort: { n: -1, _id: 1 } },
      { $limit: 10 },
    ]);
    const list = rows.map((r) => r._id);
    for (const c of CURATED_TRENDING) if (list.length < 8 && !list.includes(c)) list.push(c);
    return list;
  });
}

export async function searchHistory(userId: string): Promise<string[]> {
  const rows = await SearchLog.aggregate<{ _id: string; q: string; at: Date }>([
    { $match: { userId: new Types.ObjectId(userId) } },
    { $sort: { createdAt: -1 } },
    { $limit: 200 },
    { $group: { _id: '$normalized', q: { $first: '$q' }, at: { $first: '$createdAt' } } },
    { $sort: { at: -1 } },
    { $limit: 20 },
  ]);
  return rows.map((r) => r.q);
}

/** Removes one query (matched on its normalized form) from the user's history; anonymous counts stay for trending. */
export async function deleteSearchHistoryEntry(userId: string, q: string): Promise<void> {
  const normalized = normalizeText(q).slice(0, 100);
  if (!normalized) return;
  await SearchLog.updateMany({ userId: new Types.ObjectId(userId), normalized }, { $unset: { userId: 1 } });
}

/** Detaches the user's searches (keeps anonymous counts for trending). */
export async function clearSearchHistory(userId: string): Promise<void> {
  await SearchLog.updateMany({ userId: new Types.ObjectId(userId) }, { $unset: { userId: 1 } });
}
