import { PLANS, productCreateSchema, type ProductCreateInput } from '@souqly/shared';
import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../../lib/AppError';
import { csvRow, streamCsv } from '../../lib/csv';
import { CsvParseError, parseCsvRecords, unguardCell } from '../../lib/csvParse';
import { audit } from '../audit/audit.service';
import { Category } from '../catalog/category.model';
import { Product } from '../catalog/product.model';
import { adjustStock } from '../inventory/inventory.service';
import { applyInput, newProductSlug } from '../seller/sellerProducts.service';

/** CSV bulk upload / edit of products (Phase 10). One row per variant; upsert by `sku`. */

export const CSV_COLUMNS = [
  'product_title',
  'sku',
  'price',
  'compare_at_price',
  'stock',
  'barcode',
  'category_id',
  'description',
  'option1_name',
  'option1_value',
  'option2_name',
  'option2_value',
  'weight_grams',
] as const;
export const MAX_IMPORT_ROWS = 1000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

type ExportRow = { title: string; description: string; categoryId: Types.ObjectId; options: { key: string; name: string }[]; v: { sku: string; price: number; compareAtPrice?: number; stock: number; barcode?: string; options?: Record<string, string>; weightGrams?: number } };

/** Money in the CSV is rupees with up to 2 decimals ("1250" or "1250.50"); stored as paisa. */
export function parseRupees(s: string): number | null {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}
const rupees = (paisa: number | undefined) => (paisa === undefined ? '' : (paisa / 100).toFixed(2).replace(/\.00$/, ''));

/** Streams one row per variant of the store's (non-deleted) products. Cells are CSV-injection safe (lib/csv). */
export async function exportProducts(res: Response, storeId: Types.ObjectId): Promise<void> {
  const cursor = Product.find({ storeId, deletedAt: { $exists: false } }).select('title description categoryId options variants').sort({ _id: 1 }).lean().cursor();
  async function* rows(): AsyncIterable<ExportRow> {
    for await (const p of cursor) {
      for (const v of p.variants) yield { title: p.title, description: p.description, categoryId: p.categoryId, options: p.options ?? [], v };
    }
  }
  const opt = (r: ExportRow, i: number) => r.options[i];
  await streamCsv<ExportRow>(res, 'products.csv', [
    { header: 'product_title', value: (r) => r.title },
    { header: 'sku', value: (r) => r.v.sku },
    { header: 'price', value: (r) => rupees(r.v.price) },
    { header: 'compare_at_price', value: (r) => rupees(r.v.compareAtPrice) },
    { header: 'stock', value: (r) => r.v.stock },
    { header: 'barcode', value: (r) => r.v.barcode ?? '' },
    { header: 'category_id', value: (r) => String(r.categoryId) },
    { header: 'description', value: (r) => r.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000) },
    { header: 'option1_name', value: (r) => opt(r, 0)?.name ?? '' },
    { header: 'option1_value', value: (r) => (opt(r, 0) ? (r.v.options?.[opt(r, 0)!.key] ?? '') : '') },
    { header: 'option2_name', value: (r) => opt(r, 1)?.name ?? '' },
    { header: 'option2_value', value: (r) => (opt(r, 1) ? (r.v.options?.[opt(r, 1)!.key] ?? '') : '') },
    { header: 'weight_grams', value: (r) => r.v.weightGrams ?? '' },
  ], rows());
}

export function templateCsv(): string {
  return (
    '﻿' +
    csvRow([...CSV_COLUMNS]) +
    csvRow(['Embroidered Lawn Suit', 'LAWN-RED-S', '3500', '4500', '10', '8964000123456', '<category id>', 'Three-piece lawn suit', 'Color', 'Red', 'Size', 'S', '450']) +
    csvRow(['Embroidered Lawn Suit', 'LAWN-RED-M', '3500', '4500', '6', '', '<category id>', '', 'Color', 'Red', 'Size', 'M', '450'])
  );
}

export type RowError = { row: number; field?: string; code: string; message: string };
export type ImportResult = { dryRun: boolean; rows: number; created: number; updated: number; productsCreated: number; errors: RowError[] };

type Parsed = { row: number; title: string; sku: string; price: number; compareAt?: number; stock: number; barcode?: string; categoryId?: string; description: string; opts: { name: string; value: string }[]; weight?: number };

const optKey = (name: string) => {
  const k = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'o$1').slice(0, 32);
  return k || 'option';
};

function parseRow(rec: Record<string, string>, row: number, errors: RowError[]): Parsed | null {
  const get = (k: string) => unguardCell(rec[k] ?? '');
  const before = errors.length;
  const err = (field: string, code: string, message: string) => errors.push({ row, field, code, message });
  const sku = get('sku');
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(sku)) err('sku', 'INVALID_SKU', 'SKU is required (letters, digits, . _ -; max 64)');
  const price = parseRupees(get('price'));
  if (price === null || price <= 0) err('price', 'INVALID_PRICE', 'Price must be a positive number (rupees)');
  const compareRaw = get('compare_at_price');
  const compareAt = compareRaw ? parseRupees(compareRaw) : undefined;
  if (compareRaw && (compareAt === null || (price !== null && compareAt! <= price))) err('compare_at_price', 'INVALID_COMPARE_AT', 'Compare-at price must be higher than the price');
  const stockRaw = get('stock') || '0';
  const stock = /^\d{1,7}$/.test(stockRaw) ? Number(stockRaw) : -1;
  if (stock < 0 || stock > 1_000_000) err('stock', 'INVALID_STOCK', 'Stock must be a whole number 0-1,000,000');
  const barcode = get('barcode');
  if (barcode.length > 64) err('barcode', 'INVALID_BARCODE', 'Barcode is too long');
  const categoryId = get('category_id');
  if (categoryId && !/^[a-f0-9]{24}$/i.test(categoryId)) err('category_id', 'INVALID_CATEGORY', 'Invalid category id');
  const weightRaw = get('weight_grams');
  const weight = weightRaw ? (/^\d{1,7}$/.test(weightRaw) ? Number(weightRaw) : -1) : undefined;
  if (weight === -1) err('weight_grams', 'INVALID_WEIGHT', 'Weight must be whole grams');
  const opts: { name: string; value: string }[] = [];
  for (const n of [1, 2]) {
    const name = get(`option${n}_name`);
    const value = get(`option${n}_value`);
    if (!name && !value) continue;
    if (!name || !value || name.length > 30 || value.length > 40) err(`option${n}_name`, 'INVALID_OPTION', `Option ${n} needs a name (≤30) and a value (≤40)`);
    else opts.push({ name, value });
  }
  const title = get('product_title');
  if (errors.length > before) return null;
  return { row, title, sku, price: price!, ...(compareAt ? { compareAt } : {}), stock, ...(barcode ? { barcode } : {}), ...(categoryId ? { categoryId } : {}), description: get('description'), opts, ...(weight !== undefined ? { weight } : {}) };
}

export async function importProducts(req: Request, buffer: Buffer, dryRun: boolean): Promise<ImportResult> {
  const store = req.store!;
  const storeId = store._id;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new AppError(400, 'INVALID_ENCODING', 'Save the file as UTF-8 CSV');
  }
  let parsed: ReturnType<typeof parseCsvRecords>;
  try {
    parsed = parseCsvRecords(text, { maxRows: MAX_IMPORT_ROWS });
  } catch (e) {
    if (e instanceof CsvParseError) throw new AppError(400, 'INVALID_CSV', `${e.message} (line ${e.line})`);
    throw e;
  }
  const missing = ['product_title', 'sku', 'price'].filter((c) => !parsed.headers.includes(c));
  if (missing.length) throw new AppError(400, 'INVALID_HEADERS', `Missing columns: ${missing.join(', ')}`, { missing, expected: CSV_COLUMNS });
  if (!parsed.records.length) throw new AppError(400, 'EMPTY_CSV', 'The file has no data rows');

  const errors: RowError[] = [];
  const rows = parsed.records.map((r, i) => parseRow(r, i + 2, errors)).filter((r): r is Parsed => !!r);
  const seen = new Map<string, number>();
  for (const r of rows) {
    if (seen.has(r.sku.toLowerCase())) errors.push({ row: r.row, field: 'sku', code: 'DUPLICATE_SKU', message: `SKU repeats row ${seen.get(r.sku.toLowerCase())}` });
    else seen.set(r.sku.toLowerCase(), r.row);
  }

  // Existing variants in THIS store, by sku.
  const existing = await Product.find({ storeId, deletedAt: { $exists: false }, 'variants.sku': { $in: rows.map((r) => r.sku) } }).select('_id variants._id variants.sku variants.stock').lean();
  const bySku = new Map<string, { productId: Types.ObjectId; variantId: Types.ObjectId; stock: number }>();
  for (const p of existing) for (const v of p.variants) bySku.set(v.sku, { productId: p._id, variantId: v._id, stock: v.stock });

  const updates = rows.filter((r) => bySku.has(r.sku));
  const fresh = rows.filter((r) => !bySku.has(r.sku));
  // New products: grouped by title; each group needs a category and consistent option names.
  const groups = new Map<string, Parsed[]>();
  for (const r of fresh) {
    if (!r.title || r.title.length < 3 || r.title.length > 150) {
      errors.push({ row: r.row, field: 'product_title', code: 'INVALID_TITLE', message: 'New products need a title (3-150 characters)' });
      continue;
    }
    groups.set(r.title, [...(groups.get(r.title) ?? []), r]);
  }
  const catIds = [...new Set([...groups.values()].flat().map((r) => r.categoryId).filter(Boolean) as string[])];
  const leafCats = new Set(
    (await Category.find({ _id: { $in: catIds.map((c) => new Types.ObjectId(c)) }, isActive: true }).select('_id').lean()).map((c) => String(c._id)),
  );
  const inputs: { title: string; rows: Parsed[]; input: ProductCreateInput }[] = [];
  for (const [title, g] of groups) {
    const cat = g.find((r) => r.categoryId)?.categoryId;
    if (!cat || !leafCats.has(cat)) {
      g.forEach((r) => errors.push({ row: r.row, field: 'category_id', code: 'INVALID_CATEGORY', message: 'New products need a valid category_id' }));
      continue;
    }
    const names = g[0]!.opts.map((o) => o.name);
    if (g.some((r) => r.opts.map((o) => o.name).join('|') !== names.join('|'))) {
      g.forEach((r) => errors.push({ row: r.row, field: 'option1_name', code: 'INCONSISTENT_OPTIONS', message: 'All rows of a product must use the same option names' }));
      continue;
    }
    const options = names.map((name, i) => ({ key: optKey(name), name, values: [...new Set(g.map((r) => r.opts[i]!.value))] }));
    const candidate = {
      title,
      description: g.find((r) => r.description)?.description ?? '',
      categoryId: cat,
      options,
      variants: g.map((r) => ({
        sku: r.sku,
        options: Object.fromEntries(options.map((o, i) => [o.key, r.opts[i]!.value])),
        price: r.price,
        ...(r.compareAt ? { compareAtPrice: r.compareAt } : {}),
        stock: r.stock,
        ...(r.barcode ? { barcode: r.barcode } : {}),
        ...(r.weight !== undefined ? { weightGrams: r.weight } : {}),
      })),
    };
    const res = productCreateSchema.safeParse(candidate);
    if (!res.success) {
      for (const issue of res.error.issues) {
        const idx = issue.path[0] === 'variants' && typeof issue.path[1] === 'number' ? issue.path[1] : 0;
        errors.push({ row: g[idx]?.row ?? g[0]!.row, field: issue.path.join('.'), code: 'VALIDATION_ERROR', message: issue.message });
      }
      continue;
    }
    inputs.push({ title, rows: g, input: res.data });
  }

  // Plan limit for new products.
  const max = PLANS[store.plan ?? 'free'].limits.products;
  if (max !== null && inputs.length) {
    const used = await Product.countDocuments({ storeId, deletedAt: { $exists: false } });
    if (used + inputs.length > max) {
      throw new AppError(403, 'PLAN_LIMIT', `This import would create ${inputs.length} products; your plan allows ${max} (you have ${used}).`, { plan: store.plan ?? 'free', limit: 'products', used, max, adding: inputs.length });
    }
  }

  const result: ImportResult = { dryRun, rows: parsed.records.length, created: inputs.reduce((a, i) => a + i.rows.length, 0), updated: updates.length, productsCreated: inputs.length, errors };
  // All-or-nothing on validation: nothing is written while any row has an error.
  if (dryRun || errors.length) return { ...result, ...(errors.length ? { created: 0, updated: 0, productsCreated: 0 } : {}) };

  for (const u of updates) {
    const ref = bySku.get(u.sku)!;
    const p = await Product.findOne({ _id: ref.productId, storeId });
    const v = p?.variants.find((x) => x._id.equals(ref.variantId));
    if (!p || !v) continue;
    v.price = u.price;
    v.compareAtPrice = u.compareAt;
    if (u.barcode !== undefined) v.barcode = u.barcode;
    if (u.weight !== undefined) v.weightGrams = u.weight;
    p.recomputeDerived();
    await p.save();
    const delta = u.stock - ref.stock;
    if (delta !== 0) {
      await adjustStock({ storeId, productId: ref.productId, variantId: ref.variantId, delta, reason: 'correction', note: 'CSV import', actorId: req.user!.id }).catch(() => undefined);
    }
  }
  for (const i of inputs) {
    const product = new Product({ storeId, title: i.input.title, slug: newProductSlug(i.input.title), status: 'draft', categoryId: i.input.categoryId });
    await applyInput(product, store, i.input);
    await product.save();
  }
  await audit({ action: 'product.csv_imported', targetType: 'Store', targetId: storeId, meta: { rows: result.rows, created: result.created, updated: result.updated, products: result.productsCreated }, req });
  return result;
}
