import type { ProductDetail, ProductVariantDTO } from '@souqly/shared';

export type Selection = Record<string, string>;

const live = (v: ProductVariantDTO) => v.isActive;
const inStock = (v: ProductVariantDTO) => v.isActive && v.stock > 0;

function matches(v: ProductVariantDTO, sel: Selection, ignoreKey?: string): boolean {
  return Object.entries(sel).every(([k, val]) => k === ignoreKey || v.options[k] === val);
}

/** Initial selection: the first in-stock variant (or the first active one). */
export function initialSelection(p: ProductDetail): Selection {
  const v = p.variants.find(inStock) ?? p.variants.find(live) ?? p.variants[0];
  return v ? { ...v.options } : {};
}

/** The active variant matching every option of the selection. */
export function findVariant(p: ProductDetail, sel: Selection): ProductVariantDTO | undefined {
  if (!p.options.length) return p.variants.find(live) ?? p.variants[0];
  return p.variants.find((v) => live(v) && p.options.every((o) => v.options[o.key] === sel[o.key]));
}

/**
 * State of option `value` for `key` given the other current choices:
 * 'ok'  — buyable with the other choices,
 * 'alt' — only buyable with different other choices (selecting it re-picks them),
 * 'oos' — no in-stock variant has this value (shown disabled).
 */
export function valueState(p: ProductDetail, sel: Selection, key: string, value: string): 'ok' | 'alt' | 'oos' {
  const withValue = p.variants.filter((v) => inStock(v) && v.options[key] === value);
  if (!withValue.length) return 'oos';
  return withValue.some((v) => matches(v, sel, key)) ? 'ok' : 'alt';
}

/** Applies a choice; if the resulting combination is unavailable, re-picks the other options. */
export function choose(p: ProductDetail, sel: Selection, key: string, value: string): Selection {
  const next = { ...sel, [key]: value };
  const exact = findVariant(p, next);
  if (exact && exact.stock > 0) return next;
  const alt = p.variants.find((v) => inStock(v) && v.options[key] === value);
  return alt ? { ...alt.options } : next;
}
