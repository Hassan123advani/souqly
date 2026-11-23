import { Types } from 'mongoose';
import { Category } from '../catalog/category.model';
import { Product } from '../catalog/product.model';
import { Store } from '../stores/store.model';

/** Display-name lookups for admin DTOs (ids → names), one query per kind. Missing ids are simply absent. */
const ids = (list: unknown[]) => [...new Set(list.filter(Boolean).map(String))].filter((s) => Types.ObjectId.isValid(s)).map((s) => new Types.ObjectId(s));

export type ProductName = { id: string; title: string; slug: string; image: string | null };
export type StoreName = { id: string; name: string; slug: string };
export type CategoryName = { id: string; name: { en: string; ur?: string; ar?: string }; slug: string };

export async function productNames(list: unknown[]): Promise<Map<string, ProductName>> {
  const rows = await Product.find({ _id: { $in: ids(list) } }).select('title slug images').lean();
  return new Map(rows.map((p) => [String(p._id), { id: String(p._id), title: p.title, slug: p.slug, image: p.images?.[0]?.url ?? null }]));
}

export async function storeNames(list: unknown[]): Promise<Map<string, StoreName>> {
  const rows = await Store.find({ _id: { $in: ids(list) } }).select('name slug').lean();
  return new Map(rows.map((s) => [String(s._id), { id: String(s._id), name: s.name, slug: s.slug }]));
}

export async function categoryNames(list: unknown[]): Promise<Map<string, CategoryName>> {
  const rows = await Category.find({ _id: { $in: ids(list) } }).select('name slug').lean();
  return new Map(rows.map((c) => [String(c._id), { id: String(c._id), name: c.name as CategoryName['name'], slug: c.slug }]));
}

/** Adds `product` (title / slug / image) to every flash-sale item. */
export async function withFlashItemNames<T extends { items?: { productId: unknown }[] }>(sales: T[]): Promise<T[]> {
  const names = await productNames(sales.flatMap((s) => (s.items ?? []).map((i) => i.productId)));
  return sales.map((s) => ({ ...s, items: (s.items ?? []).map((i) => ({ ...i, product: names.get(String(i.productId)) ?? null })) }));
}
