import { PRODUCT_SORTS, type ProductSort } from '@souqly/shared';

/**
 * Product listing filters live in the URL so results are shareable and back-button safe.
 * URL prices are in MAJOR units (Rs. 1,500 → `priceMin=1500`); the API takes minor units.
 * Attribute filters use `a.<key>=v1,v2` and are sent to the API as `attrs[<key>]`.
 */
export const BOOL_FILTERS = ['freeShipping', 'cod', 'inStock', 'mall'] as const;
export const CSV_FILTERS = ['brand', 'color', 'size'] as const;
export const NUM_FILTERS = ['rating', 'discount', 'priceMin', 'priceMax'] as const;
const ATTR_PREFIX = 'a.';

export type BoolFilter = (typeof BOOL_FILTERS)[number];
export type CsvFilter = (typeof CSV_FILTERS)[number];

export function readSort(sp: URLSearchParams, fallback: ProductSort): ProductSort {
  const s = sp.get('sort');
  return s && (PRODUCT_SORTS as readonly string[]).includes(s) ? (s as ProductSort) : fallback;
}

export function readCsv(sp: URLSearchParams, key: string): string[] {
  return (sp.get(key) ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function attrKeysIn(sp: URLSearchParams): string[] {
  return [...new Set([...sp.keys()].filter((k) => k.startsWith(ATTR_PREFIX)).map((k) => k.slice(ATTR_PREFIX.length)))];
}

export const attrParam = (key: string) => `${ATTR_PREFIX}${key}`;

const isAttrKey = (k: string) => /^[a-z][a-z0-9_]{0,31}$/.test(k);

/** Builds API query params (minor-unit prices, attrs[key]) from the page URL. */
export function toApiParams(sp: URLSearchParams, extra: Record<string, string | undefined> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  const q = sp.get('q')?.trim();
  if (q) out.q = q.slice(0, 100);
  for (const k of BOOL_FILTERS) if (sp.get(k) === '1') out[k] = '1';
  for (const k of CSV_FILTERS) {
    const v = readCsv(sp, k);
    if (v.length) out[k] = v.slice(0, 20).join(',');
  }
  for (const k of ['rating', 'discount'] as const) {
    const n = Number(sp.get(k));
    if (sp.get(k) && Number.isFinite(n) && n > 0) out[k] = String(n);
  }
  for (const k of ['priceMin', 'priceMax'] as const) {
    const n = Number(sp.get(k));
    if (sp.get(k) && Number.isFinite(n) && n >= 0) out[k] = String(Math.round(n * 100));
  }
  const city = sp.get('city')?.trim();
  if (city) out.city = city.slice(0, 60);
  const category = sp.get('category')?.trim();
  if (category) out.category = category;
  for (const key of attrKeysIn(sp).slice(0, 10)) {
    const v = readCsv(sp, attrParam(key));
    if (isAttrKey(key) && v.length) out[`attrs[${key}]`] = v.join(',');
  }
  const sort = sp.get('sort');
  if (sort && (PRODUCT_SORTS as readonly string[]).includes(sort)) out.sort = sort;
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== '') out[k] = v;
  return out;
}

/** Number of active filters (excluding q / sort / category). */
export function countActiveFilters(sp: URLSearchParams): number {
  let n = 0;
  for (const k of BOOL_FILTERS) if (sp.get(k) === '1') n++;
  for (const k of CSV_FILTERS) n += readCsv(sp, k).length;
  for (const k of ['rating', 'discount', 'city'] as const) if (sp.get(k)) n++;
  if (sp.get('priceMin') || sp.get('priceMax')) n++;
  for (const key of attrKeysIn(sp)) n += readCsv(sp, attrParam(key)).length;
  return n;
}

/** Returns a copy with every filter removed (keeps q, sort and category). */
export function clearFilters(sp: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams();
  for (const k of ['q', 'sort', 'category', 'tab']) {
    const v = sp.get(k);
    if (v) next.set(k, v);
  }
  return next;
}

export function toggleCsvValue(sp: URLSearchParams, key: string, value: string): URLSearchParams {
  const next = new URLSearchParams(sp);
  const cur = readCsv(sp, key);
  const vals = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
  if (vals.length) next.set(key, vals.join(','));
  else next.delete(key);
  return next;
}

export function withParam(sp: URLSearchParams, key: string, value: string | null | undefined): URLSearchParams {
  const next = new URLSearchParams(sp);
  if (value === null || value === undefined || value === '') next.delete(key);
  else next.set(key, value);
  return next;
}
