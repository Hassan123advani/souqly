import type { ProductCard } from '@souqly/shared';

const KEY = 'souqly-recently-viewed';
const CAP = 24;

/** Guest "recently viewed" list (product card snapshots, newest first). */
export function readRecentlyViewed(): ProductCard[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? (list as ProductCard[]).filter((p) => p && typeof p.slug === 'string') : [];
  } catch {
    return [];
  }
}

export function pushRecentlyViewed(card: ProductCard): void {
  try {
    const next = [card, ...readRecentlyViewed().filter((p) => p.id !== card.id)].slice(0, CAP);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or disabled: recently viewed is best-effort.
  }
}
