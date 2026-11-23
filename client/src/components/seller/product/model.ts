import type { ProductCreateInput, SellerProduct } from '@souqly/shared';

/**
 * Editor form model. Money is typed in rupees (strings, so inputs can be empty) and converted to
 * integer minor units only when building the API payload.
 */
export type VariantRow = {
  id?: string;
  options: Record<string, string>;
  price: string;
  compareAtPrice: string;
  stock: string;
  sku: string;
  barcode: string;
};
export type OptionRow = { key: string; name: string; values: string[] };
export type ImageRow = { url: string; key: string; alt: string };

export type ProductForm = {
  title: string;
  description: string;
  highlights: string[];
  categoryId: string;
  brandName: string;
  images: ImageRow[];
  video: { url: string; key: string } | null;
  attributes: Record<string, string | string[]>;
  options: OptionRow[];
  variants: VariantRow[];
  cod: boolean;
  freeShipping: boolean;
  weightGrams: string;
  processingDays: string;
  warrantyType: 'none' | 'seller' | 'brand';
  warrantyPeriod: string;
  returnDays: string;
  returnNote: string;
  specs: { label: string; value: string }[];
  sizeGuide: string;
  wholesale: { minQty: string; price: string }[];
  preOrder: boolean;
  preOrderShipsOn: string;
};

export const emptyVariant = (options: Record<string, string> = {}): VariantRow => ({
  options,
  price: '',
  compareAtPrice: '',
  stock: '0',
  sku: '',
  barcode: '',
});

export function emptyProduct(): ProductForm {
  return {
    title: '',
    description: '',
    highlights: [],
    categoryId: '',
    brandName: '',
    images: [],
    video: null,
    attributes: {},
    options: [],
    variants: [emptyVariant()],
    cod: true,
    freeShipping: false,
    weightGrams: '500',
    processingDays: '2',
    warrantyType: 'none',
    warrantyPeriod: '',
    returnDays: '7',
    returnNote: '',
    specs: [],
    sizeGuide: '',
    wholesale: [],
    preOrder: false,
    preOrderShipsOn: '',
  };
}

const rs = (minor?: number) => (minor === undefined ? '' : String(minor / 100));
const minor = (v: string) => Math.round(Number(v) * 100);

export function fromProduct(p: SellerProduct): ProductForm {
  return {
    title: p.title,
    description: p.description ?? '',
    highlights: p.highlights ?? [],
    categoryId: p.categoryId,
    brandName: p.brand?.name ?? '',
    images: p.images.map((i) => ({ url: i.url, key: i.key, alt: i.alt ?? '' })),
    video: p.video ?? null,
    attributes: Object.fromEntries(Object.entries(p.attributes ?? {}).map(([k, v]) => [k, typeof v === 'number' ? String(v) : v])),
    options: p.options.map((o) => ({ ...o, values: [...o.values] })),
    variants: p.variants.map((v) => ({
      id: v.id,
      options: { ...v.options },
      price: rs(v.price),
      compareAtPrice: rs(v.compareAtPrice),
      // `stock` in the DTO is available stock; reserved units are part of the stored stock.
      stock: String(v.stock + (v.reserved ?? 0)),
      sku: v.sku ?? '',
      barcode: v.barcode ?? '',
    })),
    cod: p.cod,
    freeShipping: p.freeShipping,
    weightGrams: String(p.shipping?.weightGrams ?? 500),
    processingDays: String(p.shipping?.processingDays ?? 2),
    warrantyType: (p.warranty?.type as ProductForm['warrantyType']) ?? 'none',
    warrantyPeriod: p.warranty?.period ?? '',
    returnDays: p.returnPolicy ? String(p.returnPolicy.days) : '',
    returnNote: p.returnPolicy?.note ?? '',
    specs: p.specs ?? [],
    sizeGuide: p.sizeGuide ?? '',
    wholesale: (p.wholesaleTiers ?? []).map((w) => ({ minQty: String(w.minQty), price: rs(w.price) })),
    preOrder: !!p.preOrder?.enabled,
    preOrderShipsOn: p.preOrder?.shipsOn?.slice(0, 10) ?? '',
  };
}

/** Builds the API body (validated afterwards with `productCreateSchema`). */
export function toPayload(f: ProductForm): ProductCreateInput {
  const attributes: ProductCreateInput['attributes'] = {};
  for (const [k, v] of Object.entries(f.attributes)) {
    if (Array.isArray(v) ? v.length : v?.toString().trim()) attributes[k] = v;
  }
  return {
    title: f.title.trim(),
    description: f.description,
    highlights: f.highlights.map((h) => h.trim()).filter(Boolean),
    categoryId: f.categoryId,
    brandName: f.brandName.trim() || undefined,
    images: f.images.map((i) => ({ url: i.url, key: i.key, alt: i.alt.trim() || undefined })),
    video: f.video ?? undefined,
    attributes,
    options: f.options.filter((o) => o.values.length),
    variants: f.variants.map((v) => ({
      id: v.id,
      options: v.options,
      price: minor(v.price || '0'),
      compareAtPrice: v.compareAtPrice ? minor(v.compareAtPrice) : undefined,
      stock: Math.max(0, Math.floor(Number(v.stock) || 0)),
      sku: v.sku.trim() || undefined,
      barcode: v.barcode.trim() || undefined,
      isActive: true,
    })),
    tags: [],
    cod: f.cod,
    freeShipping: f.freeShipping,
    shipping: { weightGrams: Math.round(Number(f.weightGrams) || 0), processingDays: Math.round(Number(f.processingDays) || 0) },
    warranty: f.warrantyType === 'none' ? undefined : { type: f.warrantyType, period: f.warrantyPeriod.trim() },
    returnPolicy: f.returnDays === '' ? undefined : { days: Math.round(Number(f.returnDays)), note: f.returnNote.trim() || undefined },
    sizeGuide: f.sizeGuide.trim() || undefined,
    specs: f.specs.filter((s) => s.label.trim() && s.value.trim()).map((s) => ({ label: s.label.trim(), value: s.value.trim() })),
    wholesaleTiers: f.wholesale.length
      ? f.wholesale.filter((w) => w.minQty && w.price).map((w) => ({ minQty: Math.round(Number(w.minQty)), price: minor(w.price) }))
      : undefined,
    preOrder: f.preOrder ? { enabled: true, shipsOn: f.preOrderShipsOn ? new Date(f.preOrderShipsOn) : undefined } : undefined,
  };
}

/** Every combination of option values (cartesian product), keeping existing rows by their options. */
export function buildVariants(options: OptionRow[], existing: VariantRow[]): VariantRow[] {
  const opts = options.filter((o) => o.values.length);
  if (!opts.length) return existing.length ? [{ ...existing[0]!, options: {} }] : [emptyVariant()];
  let combos: Record<string, string>[] = [{}];
  for (const o of opts) combos = combos.flatMap((c) => o.values.map((v) => ({ ...c, [o.key]: v })));
  const sig = (o: Record<string, string>) => JSON.stringify(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  const byCombo = new Map(existing.map((v) => [sig(v.options), v]));
  const template = existing[0];
  return combos.slice(0, 200).map(
    (c) =>
      byCombo.get(sig(c)) ?? {
        ...emptyVariant(c),
        price: template?.price ?? '',
        compareAtPrice: template?.compareAtPrice ?? '',
      },
  );
}

/** `Color` → `color`, `Size (EU)` → `size_eu` (matches `attributeKeySchema`). */
export function optionKey(name: string): string {
  const k = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[^a-z]+/, '')
    .slice(0, 32);
  return k || `opt_${Math.random().toString(36).slice(2, 7)}`;
}
