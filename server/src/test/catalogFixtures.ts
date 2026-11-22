import { slugify } from '@souqly/shared';
import { Types } from 'mongoose';
import { Brand } from '../modules/catalog/brand.model';
import { buildSearchText } from '../modules/catalog/catalog.service';
import { Category } from '../modules/catalog/category.model';
import { Product } from '../modules/catalog/product.model';
import { Store } from '../modules/stores/store.model';

let n = 0;

export async function makeCategoryTree() {
  n++;
  const top = await Category.create({ name: { en: 'Fashion', ur: 'فیشن', ar: 'أزياء' }, slug: `fashion-${n}`, parentId: null, ancestors: [] , attributes: [{ key: 'color', label: { en: 'Color', ur: '', ar: '' }, type: 'color', filterable: true, variantDefining: true }] });
  const sub = await Category.create({
    name: { en: 'Shirts', ur: 'شرٹس', ar: 'قمصان' },
    slug: `shirts-${n}`,
    parentId: top._id,
    ancestors: [{ _id: top._id, slug: top.slug, name: top.name }],
  });
  const other = await Category.create({ name: { en: 'Kitchen', ur: '', ar: '' }, slug: `kitchen-${n}`, parentId: null, ancestors: [] });
  return { top, sub, other };
}

export async function makeStore(overrides: Record<string, unknown> = {}) {
  n++;
  return Store.create({
    ownerId: new Types.ObjectId(),
    name: `Store ${n}`,
    slug: `store-${n}-${Date.now() % 100000}`,
    status: 'approved',
    address: { city: 'Lahore' },
    business: { legalName: 'Secret Pvt Ltd', ntn: '1234567-8' },
    payout: { iban: 'PK00SECRET0000000000' },
    contact: { email: 'owner-secret@example.com', phone: '+923001112223', whatsapp: '+923001112223' },
    ...overrides,
  });
}

export async function makeBrand(name: string) {
  return Brand.create({ name, slug: slugify(name) });
}

type ProductOpts = {
  storeId: Types.ObjectId;
  category: { _id: Types.ObjectId; ancestors: { _id: Types.ObjectId }[]; name: { en: string } };
  title: string;
  price: number;
  compareAt?: number;
  soldCount?: number;
  ratingAvg?: number;
  stock?: number;
  status?: 'draft' | 'published' | 'pending_review';
  color?: string;
  brand?: { _id: Types.ObjectId; name: string };
  freeShipping?: boolean;
  publishedAt?: Date;
  tags?: string[];
};

export async function makeProduct(o: ProductOpts) {
  n++;
  const p = new Product({
    storeId: o.storeId,
    title: o.title,
    slug: `${slugify(o.title)}-${n}`,
    categoryId: o.category._id,
    categoryPath: [...o.category.ancestors.map((a) => a._id), o.category._id],
    images: [{ url: `/uploads/test/${n}.png`, key: `test/${n}.png` }],
    options: o.color ? [{ key: 'color', name: 'Color', values: [o.color] }] : [],
    variants: [{ sku: `SKU-${n}`, options: o.color ? { color: o.color } : {}, price: o.price, compareAtPrice: o.compareAt, stock: o.stock ?? 20 }],
    status: o.status ?? 'published',
    publishedAt: o.publishedAt ?? new Date(Date.now() - n * 1000),
    soldCount: o.soldCount ?? 0,
    ratingAvg: o.ratingAvg ?? 0,
    tags: o.tags ?? [],
    freeShipping: !!o.freeShipping,
    ...(o.brand ? { brandId: o.brand._id, brandName: o.brand.name } : {}),
    searchText: buildSearchText({ title: o.title, brandName: o.brand?.name, tags: o.tags }, [o.category.name.en]),
  });
  await p.save();
  return p;
}
