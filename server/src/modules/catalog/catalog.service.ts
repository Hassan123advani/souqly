import type { AttributeDef, BrandDTO, Breadcrumb, CategoryDetail, CategoryNode, ProductCard } from '@souqly/shared';
import { Types } from 'mongoose';
import { notFound } from '../../lib/AppError';
import { TtlCache } from '../../lib/cache';
import { normalizeText } from '../../lib/text';
import { Store } from '../stores/store.model';
import { Brand } from './brand.model';
import { Category, type ICategory } from './category.model';
import { FlashSale } from './marketing.models';
import type { ProductLean } from './product.model';

type CategoryLean = ICategory & { _id: Types.ObjectId };

// ---------------------------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------------------------

const categoryCache = new TtlCache<{ tree: CategoryNode[]; all: CategoryLean[] }>(60_000, 1);

async function loadCategories() {
  return categoryCache.get('all', async () => {
    const all = (await Category.find({ isActive: true }).sort({ order: 1, 'name.en': 1 }).lean()) as CategoryLean[];
    const nodes = new Map<string, CategoryNode>();
    for (const c of all) {
      nodes.set(String(c._id), {
        id: String(c._id),
        slug: c.slug,
        name: c.name,
        icon: c.icon,
        ...(c.image ? { image: c.image } : {}),
        ...(c.color ? { color: c.color } : {}),
        order: c.order,
        children: [],
      });
    }
    const tree: CategoryNode[] = [];
    for (const c of all) {
      const node = nodes.get(String(c._id))!;
      const parent = c.parentId ? nodes.get(String(c.parentId)) : undefined;
      if (parent) parent.children.push(node);
      else if (!c.parentId) tree.push(node);
      // Children of an inactive parent are hidden.
    }
    return { tree, all };
  });
}

export function invalidateCategoryCache(): void {
  categoryCache.clear();
}

export async function getCategoryTree(): Promise<CategoryNode[]> {
  return (await loadCategories()).tree;
}

export async function getTopCategories(): Promise<CategoryNode[]> {
  return (await loadCategories()).tree.map((c) => ({ ...c, children: [] }));
}

export async function findCategoryBySlug(slug: string): Promise<CategoryLean | undefined> {
  return (await loadCategories()).all.find((c) => c.slug === slug);
}

export async function getCategoryMap(): Promise<Map<string, CategoryLean>> {
  return new Map((await loadCategories()).all.map((c) => [String(c._id), c]));
}

/** Own attributes merged over the ancestors' (closest definition wins). */
export async function effectiveAttributes(category: CategoryLean): Promise<AttributeDef[]> {
  const map = await getCategoryMap();
  const merged = new Map<string, AttributeDef>();
  for (const a of category.ancestors) for (const def of map.get(String(a._id))?.attributes ?? []) merged.set(def.key, def);
  for (const def of category.attributes) merged.set(def.key, def);
  return [...merged.values()];
}

export function breadcrumbsOf(category: Pick<CategoryLean, 'ancestors' | 'slug' | 'name'>): Breadcrumb[] {
  return [...category.ancestors.map((a) => ({ slug: a.slug, name: a.name })), { slug: category.slug, name: category.name }];
}

export const STANDARD_FILTERS = ['price', 'rating', 'brand', 'freeShipping', 'cod', 'discount', 'inStock', 'mall', 'city'];

export async function getCategoryDetail(slug: string): Promise<CategoryDetail> {
  const cat = await findCategoryBySlug(slug);
  if (!cat) throw notFound('Category');
  const { all } = await loadCategories();
  const children = all
    .filter((c) => c.parentId && String(c.parentId) === String(cat._id))
    .map((c) => ({ id: String(c._id), slug: c.slug, name: c.name, icon: c.icon, ...(c.image ? { image: c.image } : {}) }));
  const attrs = await effectiveAttributes(cat);
  return {
    category: {
      id: String(cat._id),
      slug: cat.slug,
      name: cat.name,
      icon: cat.icon,
      ...(cat.image ? { image: cat.image } : {}),
      ...(cat.color ? { color: cat.color } : {}),
      parentId: cat.parentId ? String(cat.parentId) : null,
    },
    breadcrumbs: breadcrumbsOf(cat),
    children,
    filters: { standard: STANDARD_FILTERS, attributes: attrs.filter((a) => a.filterable) },
  };
}

/** Builds `ancestors` and `categoryPath` (ancestors + self) for a category id. */
export async function categoryPathFor(categoryId: Types.ObjectId | string): Promise<{ category: CategoryLean; path: Types.ObjectId[] }> {
  const category = (await Category.findOne({ _id: categoryId, isActive: true }).lean()) as CategoryLean | null;
  if (!category) throw notFound('Category');
  return { category, path: [...category.ancestors.map((a) => a._id), category._id] };
}

// ---------------------------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------------------------

export function toBrandDTO(b: { _id: Types.ObjectId; name: string; slug: string; logo?: string; description?: string; isFeatured: boolean }): BrandDTO {
  return {
    id: String(b._id),
    name: b.name,
    slug: b.slug,
    ...(b.logo ? { logo: b.logo } : {}),
    ...(b.description ? { description: b.description } : {}),
    isFeatured: !!b.isFeatured,
  };
}

export async function listBrands(featured?: boolean): Promise<BrandDTO[]> {
  const brands = await Brand.find(featured ? { isFeatured: true } : {}).sort({ name: 1 }).limit(500).lean();
  return brands.map(toBrandDTO);
}

export async function getBrand(slug: string): Promise<BrandDTO> {
  const b = await Brand.findOne({ slug }).lean();
  if (!b) throw notFound('Brand');
  return toBrandDTO(b);
}

// ---------------------------------------------------------------------------------------------
// Public store index: which stores are visible (approved) + the bits product cards need
// ---------------------------------------------------------------------------------------------

export type PublicStoreInfo = {
  id: Types.ObjectId;
  slug: string;
  name: string;
  isMall: boolean;
  city?: string;
  onHoliday: boolean;
  holidayMessage?: string;
};

const storeIndexCache = new TtlCache<Map<string, PublicStoreInfo>>(30_000, 1);

export async function getPublicStoreIndex(): Promise<Map<string, PublicStoreInfo>> {
  return storeIndexCache.get('all', async () => {
    const now = new Date();
    const stores = await Store.find({ status: 'approved' }).select('slug name isMall address.city holidayMode').lean();
    return new Map(
      stores.map((s) => {
        const onHoliday = !!s.holidayMode?.enabled && (!s.holidayMode.until || s.holidayMode.until > now);
        return [
          String(s._id),
          {
            id: s._id,
            slug: s.slug,
            name: s.name,
            isMall: !!s.isMall,
            ...(s.address?.city ? { city: s.address.city } : {}),
            onHoliday,
            ...(onHoliday && s.holidayMode.message ? { holidayMessage: s.holidayMode.message } : {}),
          },
        ];
      }),
    );
  });
}

export function invalidateStoreIndex(): void {
  storeIndexCache.clear();
}

// ---------------------------------------------------------------------------------------------
// Flash sale lookup (productId → flash price)
// ---------------------------------------------------------------------------------------------

export type FlashInfo = { saleId: string; title: string; startsAt: Date; endsAt: Date; byProduct: Map<string, { price: number; variantId?: string }> };

const flashCache = new TtlCache<FlashInfo | null>(30_000, 1);

export async function getCurrentFlash(): Promise<FlashInfo | null> {
  return flashCache.get('current', async () => {
    const now = new Date();
    const sale = await FlashSale.findOne({ isActive: true, startsAt: { $lte: now }, endsAt: { $gt: now } }).sort({ endsAt: 1 }).lean();
    if (!sale) return null;
    const byProduct = new Map<string, { price: number; variantId?: string }>();
    for (const i of sale.items) {
      if (i.sold >= i.quantityLimit) continue;
      byProduct.set(String(i.productId), { price: i.flashPrice, ...(i.variantId ? { variantId: String(i.variantId) } : {}) });
    }
    return { saleId: String(sale._id), title: sale.title, startsAt: sale.startsAt, endsAt: sale.endsAt, byProduct };
  });
}

export function invalidateFlashCache(): void {
  flashCache.clear();
}

// ---------------------------------------------------------------------------------------------
// ProductCard
// ---------------------------------------------------------------------------------------------

/** Fields a card needs (use as a projection). */
export const CARD_FIELDS =
  'storeId title slug images priceMin compareAtMin discountPct ratingAvg ratingCount soldCount freeShipping cod totalStock preOrder';

export type CardSource = Pick<
  ProductLean,
  'storeId' | 'title' | 'slug' | 'images' | 'priceMin' | 'compareAtMin' | 'discountPct' | 'ratingAvg' | 'ratingCount' | 'soldCount' | 'freeShipping' | 'cod' | 'totalStock' | 'preOrder'
> & { _id: Types.ObjectId };

export function toProductCard(p: CardSource, stores: Map<string, PublicStoreInfo>, flash: FlashInfo | null): ProductCard | null {
  const store = stores.get(String(p.storeId));
  if (!store) return null;
  const f = flash?.byProduct.get(String(p._id));
  return {
    id: String(p._id),
    slug: p.slug,
    title: p.title,
    image: p.images?.[0]?.url ?? '',
    price: p.priceMin,
    ...(p.compareAtMin ? { compareAtPrice: p.compareAtMin } : {}),
    discountPct: p.discountPct ?? 0,
    ratingAvg: p.ratingAvg ?? 0,
    ratingCount: p.ratingCount ?? 0,
    soldCount: p.soldCount ?? 0,
    freeShipping: !!p.freeShipping,
    cod: !!p.cod,
    isMall: store.isMall,
    store: { slug: store.slug, name: store.name },
    ...(p.totalStock < 10 ? { stockLeft: Math.max(0, p.totalStock) } : {}),
    ...(f && flash ? { flash: { price: f.price, endsAt: flash.endsAt.toISOString() } } : {}),
    ...(store.onHoliday ? { unavailable: true } : {}),
    ...(p.preOrder?.enabled ? { preOrder: true } : {}),
  };
}

export async function toProductCards(products: CardSource[]): Promise<ProductCard[]> {
  const [stores, flash] = await Promise.all([getPublicStoreIndex(), getCurrentFlash()]);
  return products.map((p) => toProductCard(p, stores, flash)).filter((c): c is ProductCard => c !== null);
}

/** Base filter for anything public: published, not deleted, store approved. */
export async function publicProductFilter(): Promise<Record<string, unknown>> {
  const stores = await getPublicStoreIndex();
  return { status: 'published', deletedAt: { $exists: false }, storeId: { $in: [...stores.values()].map((s) => s.id) } };
}

/** Normalized text used by the fuzzy search layer (title + brand + tags + category names in all languages). */
export function buildSearchText(p: { title: string; brandName?: string; tags?: string[] }, categoryNames: string[]): string {
  return normalizeText([p.title, p.brandName ?? '', ...(p.tags ?? []), ...categoryNames].join(' ')).slice(0, 2000);
}
