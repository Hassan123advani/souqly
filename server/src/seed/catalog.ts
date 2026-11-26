import { slugify } from '@souqly/shared';
import { Types } from 'mongoose';
import { logger } from '../lib/logger';
import { sanitizeRichText } from '../lib/sanitize';
import { Brand } from '../modules/catalog/brand.model';
import { buildSearchText, invalidateCategoryCache, invalidateFlashCache, invalidateStoreIndex } from '../modules/catalog/catalog.service';
import { Category, type CategoryDoc } from '../modules/catalog/category.model';
import { invalidateHomeCache } from '../modules/catalog/home.service';
import { Campaign, FlashSale, HomeContent } from '../modules/catalog/marketing.models';
import { Product, type IVariant, type ProductDoc } from '../modules/catalog/product.model';
import { invalidateVocabulary } from '../modules/catalog/search.service';
import { Store, type StoreDoc } from '../modules/stores/store.model';
import { StoreMember } from '../modules/stores/storeMember.model';
import { User } from '../modules/users/user.model';
import { generateReferralCode } from '../modules/users/user.service';
import { getStorage } from '../services/storage';
import { escapeXml, heroArt, heroPhotoArt, productArt, storeBanner, storeBannerPhoto, storeLogo } from './data/art';
import { SEED_BRANDS } from './data/brands';
import { SEED_CATEGORIES, type SeedCategory } from './data/categories';
import { HERO_SLIDES, HOME_SECTIONS, seedCampaigns } from './data/home';
import { createRng, hashString, shortId, type Rng } from './data/prng';
import { COLOR_HEX, COLORS, STYLE_WORDS, TEMPLATES, type ProductTemplate } from './data/productTemplates';
import { TEMPLATES_2 } from './data/productTemplates2';
import { REAL_PRODUCTS, type RealProduct } from './data/realProducts';
import { loadSeedImage, realImagesEnabled } from './realImages';
import { SEED_STORES, STORE_POLICIES, type SeedStore } from './data/stores';

const ALL_TEMPLATES: Record<string, ProductTemplate[]> = { ...TEMPLATES, ...TEMPLATES_2 };
const PRODUCTS_PER_STORE = 18;
const DAY = 24 * 3600_000;
/** Rough demo conversion for the USD prices in data/realProducts.ts. */
const USD_TO_PKR = 280;
/** Real brands that get a "featured" badge. */
const FEATURED_REAL_BRANDS = new Set(['Apple', 'Samsung', 'Nike', 'Rolex', 'Dior', 'Chanel', 'Gucci', 'Dell', 'Lenovo', 'Oppo', 'Vivo', 'Realme', 'Kawasaki', 'Puma']);
/** Sub-category slug → its top-level seed category. */
const TOP_OF_SUB = new Map(SEED_CATEGORIES.flatMap((c) => c.children.map((s) => [s.slug, c] as const)));

/** Writes seed art at a stable key (re-seeding overwrites instead of piling up files). */
async function putSvg(key: string, svg: string): Promise<{ url: string; key: string }> {
  return getStorage().upload(Buffer.from(svg, 'utf8'), { folder: 'seed', filename: key, mimetype: 'image/svg+xml', fixedKey: key });
}

/** First photo of each named real product as a data: URI (embedded in banner SVGs). Empty when photos are off/unavailable. */
async function photosByTitle(titles: string[]): Promise<string[]> {
  if (!realImagesEnabled()) return [];
  const out = await Promise.all(
    titles.map(async (t) => {
      const url = REAL_PRODUCTS.find((p) => p.title === t)?.images[0];
      const img = url ? await loadSeedImage(url) : null;
      return img ? `data:${img.mimetype};base64,${img.buffer.toString('base64')}` : null;
    }),
  );
  return out.filter((x): x is string => !!x);
}

/** Three photos spread across a store's real products, for its banner. */
function storePhotos(storeSlug: string): Promise<string[]> {
  const items = REAL_PRODUCTS.filter((p) => p.store === storeSlug);
  const step = Math.max(1, Math.floor(items.length / 3));
  return photosByTitle(items.filter((_, i) => i % step === 0).slice(0, 3).map((p) => p.title));
}

/** Runs async tasks with limited concurrency. */
async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]!);
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// Categories & brands
// ---------------------------------------------------------------------------------------------

async function seedCategories(): Promise<Map<string, CategoryDoc>> {
  const bySlug = new Map<string, CategoryDoc>();
  for (const [order, c] of SEED_CATEGORIES.entries()) {
    let top = await Category.findOne({ slug: c.slug });
    top ??= await Category.create({
      name: { en: c.en, ur: c.ur, ar: c.ar },
      slug: c.slug,
      parentId: null,
      ancestors: [],
      icon: c.icon,
      color: c.color,
      order,
      attributes: c.attributes,
      demo: true,
    });
    bySlug.set(c.slug, top);
    for (const [subOrder, s] of c.children.entries()) {
      let sub = await Category.findOne({ slug: s.slug });
      sub ??= await Category.create({
        name: { en: s.en, ur: s.ur, ar: s.ar },
        slug: s.slug,
        parentId: top._id,
        ancestors: [{ _id: top._id, slug: top.slug, name: top.name }],
        icon: s.icon,
        color: c.color,
        order: subOrder,
        attributes: [],
        demo: true,
      });
      bySlug.set(s.slug, sub);
    }
  }
  return bySlug;
}

async function seedBrands(): Promise<Map<string, { _id: Types.ObjectId; name: string }>> {
  const byName = new Map<string, { _id: Types.ObjectId; name: string }>();
  for (const b of SEED_BRANDS) {
    const slug = slugify(b.name);
    let doc = await Brand.findOne({ slug });
    doc ??= await Brand.create({ name: b.name, slug, description: b.description, isFeatured: !!b.featured, demo: true });
    byName.set(b.name, { _id: doc._id, name: doc.name });
  }
  for (const name of new Set(REAL_PRODUCTS.flatMap((p) => (p.brand ? [p.brand] : [])))) {
    if (byName.has(name)) continue;
    const slug = slugify(name);
    let doc = await Brand.findOne({ slug });
    doc ??= await Brand.create({ name, slug, description: `Original ${name} products from authorised sellers.`, isFeatured: FEATURED_REAL_BRANDS.has(name), demo: true });
    byName.set(name, { _id: doc._id, name: doc.name });
  }
  return byName;
}

// ---------------------------------------------------------------------------------------------
// Stores + owners
// ---------------------------------------------------------------------------------------------

async function seedStore(s: SeedStore, index: number, passwordHash: string, cats: Map<string, CategoryDoc>): Promise<{ store: StoreDoc; created: boolean }> {
  let owner = await User.findOne({ email: s.owner.email });
  owner ??= await User.create({
    name: s.owner.name,
    email: s.owner.email,
    phone: s.owner.phone,
    passwordHash,
    emailVerified: true,
    phoneVerified: true,
    isSeller: true,
    referralCode: await generateReferralCode(),
    demo: true,
  });

  let store = await Store.findOne({ slug: s.slug });
  let created = false;
  if (!store) {
    const rng = createRng(hashString(`store:${s.slug}`));
    const [logo, banner] = await Promise.all([
      putSvg(`seed/stores/${s.slug}-logo.svg`, storeLogo(s.name, s.themeColor)),
      storePhotos(s.slug).then((photos) =>
        putSvg(`seed/stores/${s.slug}-banner.svg`, photos.length >= 2 ? storeBannerPhoto(s.name, s.tagline, s.themeColor, photos) : storeBanner(s.name, s.tagline, s.themeColor, index)),
      ),
    ]);
    store = await Store.create({
      ownerId: owner._id,
      name: s.name,
      slug: s.slug,
      tagline: s.tagline,
      description: s.description,
      logo,
      banner,
      themeColor: s.themeColor,
      categoryIds: [s.category, ...(s.extraCategories ?? [])].flatMap((slug) => {
        const c = SEED_CATEGORIES.find((x) => x.slug === slug)!;
        return [cats.get(c.slug)!._id, ...c.children.map((ch) => cats.get(ch.slug)!._id)];
      }),
      status: 'approved',
      isMall: !!s.isMall,
      contact: { email: s.owner.email, phone: s.owner.phone, whatsapp: s.owner.phone },
      address: { line1: `${rng.int(1, 300)} Main Bazaar`, city: s.city, country: 'PK' },
      policies: {
        shipping: sanitizeRichText(STORE_POLICIES.shipping),
        returns: sanitizeRichText(STORE_POLICIES.returns),
        warranty: sanitizeRichText(STORE_POLICIES.warranty),
      },
      layoutTemplate: s.layoutTemplate,
      sections: [
        { type: 'hero', config: {} },
        { type: 'featured', title: 'Featured picks', config: { limit: 8 } },
        { type: 'deals', title: 'Deals', config: { limit: 8 } },
        { type: 'new_arrivals', title: 'New arrivals', config: { limit: 12 } },
        { type: 'best_sellers', title: 'Best sellers', config: { limit: 12 } },
      ],
      seo: { title: `${s.name} — ${s.tagline}`, description: s.description },
      holidayMode: s.holiday ? { enabled: true, message: s.holiday, until: new Date(Date.now() + 7 * DAY) } : { enabled: false },
      followerCount: s.isMall ? rng.int(8_000, 60_000) : rng.int(300, 9_000),
      responseRate: rng.int(86, 100),
      responseTimeHours: rng.int(1, 12),
      healthScore: rng.int(82, 100),
      plan: s.plan,
      business: { legalName: `${s.name} (Pvt) Ltd`, ntn: `${rng.int(1000000, 9999999)}-${rng.int(1, 9)}`, cnicLast4: String(rng.int(1000, 9999)) },
      payout: { method: 'bank', bankName: 'Demo Bank', accountTitle: s.owner.name, ibanLast4: String(rng.int(1000, 9999)) },
      demo: true,
      createdAt: new Date(Date.now() - rng.int(200, 900) * DAY),
    });
    created = true;
  }
  await StoreMember.updateOne(
    { storeId: store._id, userId: owner._id },
    { $setOnInsert: { role: 'OWNER', permissions: [], status: 'active', demo: true } },
    { upsert: true },
  );
  return { store, created };
}

// ---------------------------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------------------------

type OptionDef = { key: string; name: string; values: string[]; priceStep?: number[] };

function roundPrice(rupees: number): number {
  const step = rupees >= 10_000 ? 500 : rupees >= 1_000 ? 50 : 10;
  return Math.max(step, Math.round(rupees / step) * step - (rupees >= 1_000 ? 1 : 0));
}

function optionsFor(t: ProductTemplate, cat: SeedCategory, rng: Rng): OptionDef[] {
  switch (t.scheme) {
    case 'apparel':
      return [
        { key: 'color', name: 'Color', values: rng.sample(COLORS, 3) },
        { key: 'size', name: 'Size', values: ['S', 'M', 'L', 'XL'], priceStep: [0, 0, 0, 0.05] },
      ];
    case 'kids':
      return [
        { key: 'color', name: 'Color', values: rng.sample(COLORS, 2) },
        { key: 'age', name: 'Age', values: ['3-4Y', '5-6Y', '7-8Y', '9-10Y'], priceStep: [0, 0.05, 0.1, 0.15] },
      ];
    case 'phone':
      return [
        { key: 'storage', name: 'Storage', values: ['64GB', '128GB', '256GB'], priceStep: [0, 0.18, 0.38] },
        { key: 'color', name: 'Color', values: rng.sample(['Graphite', 'Midnight', 'Mint', 'Silver'], 2) },
      ];
    case 'color':
      return [{ key: 'color', name: 'Color', values: rng.sample(COLORS, 3) }];
    case 'capacity':
      return [{ key: 'capacity', name: 'Capacity', values: ['3L', '5L'], priceStep: [0, 0.3] }];
    case 'shade':
      return [{ key: 'shade', name: 'Shade', values: rng.sample(['Rosewood', 'Brick Red', 'Nude Pink', 'Berry', 'Mocha', 'Coral'], 4) }];
    case 'weight':
      return [{ key: 'weight', name: 'Pack size', values: ['500g', '1kg', '5kg'], priceStep: [0, 0.9, 7.5] }];
    case 'metal':
      return cat.slug === 'jewelry-watches' && t.sub === 'watches'
        ? [{ key: 'metal', name: 'Metal', values: ['Steel', 'Gold plated', 'Rose gold'], priceStep: [0, 0.15, 0.2] }]
        : [{ key: 'metal', name: 'Metal', values: ['Silver', 'Gold plated', 'Rose gold'], priceStep: [0, 0.1, 0.15] }];
    case 'none':
      return [];
  }
}

/** Cartesian product of option values. */
function combos(options: OptionDef[]): { values: Record<string, string>; factor: number }[] {
  let out: { values: Record<string, string>; factor: number }[] = [{ values: {}, factor: 1 }];
  for (const o of options) {
    out = out.flatMap((c) => o.values.map((v, i) => ({ values: { ...c.values, [o.key]: v }, factor: c.factor * (1 + (o.priceStep?.[i] ?? 0)) })));
  }
  return out;
}

function sizeGuideHtml(): string {
  return sanitizeRichText(
    '<table><thead><tr><th>Size</th><th>Chest (in)</th><th>Length (in)</th></tr></thead><tbody>' +
      [['S', '38', '40'], ['M', '40', '41'], ['L', '42', '42'], ['XL', '44', '43']].map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') +
      '</tbody></table>',
  );
}

type GenContext = {
  store: StoreDoc;
  seed: SeedStore;
  storeIndex: number;
  cat: SeedCategory;
  cats: Map<string, CategoryDoc>;
  brands: Map<string, { _id: Types.ObjectId; name: string }>;
};

async function generateProduct(ctx: GenContext, i: number): Promise<ProductDoc> {
  const { store, seed, cat, cats, brands, storeIndex } = ctx;
  const rng = createRng(hashString(`product:${seed.slug}:${i}`));
  const templates = ALL_TEMPLATES[cat.slug]!;
  const t = templates[i % templates.length]!;
  const styles = STYLE_WORDS[cat.slug]!;
  const style = styles[(Math.floor(i / templates.length) * 2 + i) % styles.length]!;
  const brand = brands.get(seed.brands[i % seed.brands.length]!)!;
  const title = `${brand.name} ${style} ${t.name}`;
  const slug = `${slugify(title)}-${shortId(`${seed.slug}:${i}`)}`;
  const sub = cats.get(t.sub)!;
  const top = cats.get(cat.slug)!;

  // Pricing
  const base = roundPrice(t.price[0] + (t.price[1] - t.price[0]) * rng.next() * 0.7);
  const hasCompare = rng.chance(0.4);
  const markup = 1 + 0.12 + rng.next() * 0.45;
  const options = optionsFor(t, cat, rng);

  // Stock profile: ~12% low stock, ~4% sold out
  const roll = rng.next();
  const stockProfile = roll < 0.04 ? 'out' : roll < 0.16 ? 'low' : 'normal';
  const variants: Partial<IVariant>[] = combos(options).map((c, vi) => {
    const price = roundPrice(base * c.factor) * 100;
    return {
      _id: new Types.ObjectId(),
      sku: `${seed.slug.replace(/[^a-z]/g, '').slice(0, 5).toUpperCase()}-${String(i + 1).padStart(3, '0')}-${vi + 1}`,
      options: c.values,
      price,
      ...(hasCompare ? { compareAtPrice: roundPrice((price / 100) * markup) * 100 } : {}),
      stock: stockProfile === 'out' ? 0 : stockProfile === 'low' ? rng.int(1, 3) : rng.int(8, 120),
      reserved: 0,
      isActive: true,
    };
  });

  // Images (2–3 per product)
  const accentValue = options.find((o) => o.key === 'color' || o.key === 'metal')?.values[0];
  const accent = accentValue ? COLOR_HEX[accentValue] : undefined;
  const imageCount = i % 3 === 0 ? 2 : 3;
  const images = await Promise.all(
    Array.from({ length: imageCount }, async (_, n) => {
      const svg = productArt({ kind: cat.art, palette: cat.palette, accent: n === 1 && options[0]?.values[1] ? COLOR_HEX[options[0].values[1]] ?? accent : accent, label: t.name, brand: brand.name, variant: n });
      const stored = await putSvg(`seed/products/${slug}-${n + 1}.svg`, svg);
      return { ...stored, alt: `${title} — image ${n + 1}` };
    }),
  );

  const soldCount = Math.floor(Math.pow(rng.next(), 3) * 4200);
  const ratingCount = soldCount ? Math.max(1, Math.floor(soldCount * (0.05 + rng.next() * 0.25))) : 0;
  const publishedAt = new Date(Date.now() - rng.int(1, 120) * DAY - rng.int(0, 86_000) * 1000);
  const isElectronics = ['mobiles-tablets', 'electronic-devices'].includes(cat.slug);
  const isApparel = t.scheme === 'apparel';
  const status = (storeIndex === 0 || storeIndex === 5) && i === 16 ? 'draft' : storeIndex === 1 && i === 15 ? 'pending_review' : 'published';
  const preOrder = [2, 4, 11].includes(storeIndex) && i === 17;
  const wholesale = ['groceries', 'books-stationery'].includes(cat.slug) && i % 4 === 0;

  const description = sanitizeRichText(
    `<p>The <strong>${title}</strong> brings ${brand.name}'s signature quality to your everyday life. ` +
      `Carefully selected by ${seed.name} and packed with care in ${seed.city}.</p>` +
      `<h3>Why you'll love it</h3><ul>${t.highlights.map((h) => `<li>${h}</li>`).join('')}</ul>` +
      `<p>${style} styling, honest pricing and fast delivery across Pakistan. Cash on delivery available on most orders.</p>`,
  );

  const product = new Product({
    storeId: store._id,
    title,
    slug,
    description,
    highlights: t.highlights,
    categoryId: sub._id,
    categoryPath: [top._id, sub._id],
    brandId: brand._id,
    brandName: brand.name,
    images,
    attributes: {
      ...(t.attributes ?? {}),
      ...(options.find((o) => o.key === 'color') ? { color: options.find((o) => o.key === 'color')!.values } : {}),
    },
    options: options.map((o) => ({ key: o.key, name: o.name, values: o.values })),
    variants,
    status,
    tags: t.tags,
    searchText: buildSearchText({ title, brandName: brand.name, tags: t.tags }, [top.name.en, top.name.ur, top.name.ar, sub.name.en, sub.name.ur, sub.name.ar]),
    cod: rng.chance(0.85),
    freeShipping: rng.chance(seed.isMall ? 0.6 : 0.3),
    shipping: { weightGrams: rng.int(150, 3000), processingDays: rng.int(1, 3) },
    ...(isElectronics ? { warranty: { type: 'brand', period: rng.pick(['6 months', '1 year']) } } : {}),
    returnPolicy: { days: 7, note: 'Unused items in original packaging.' },
    ...(isApparel ? { sizeGuide: sizeGuideHtml() } : {}),
    specs: [...(t.specs ?? []).map(([label, value]) => ({ label, value })), { label: 'Brand', value: brand.name }, { label: 'Model', value: `${brand.name.slice(0, 3).toUpperCase()}-${rng.int(100, 999)}` }],
    ...(wholesale ? { wholesaleTiers: [{ minQty: 10, price: Math.round((base * 0.92) / 1) * 100 }, { minQty: 50, price: Math.round(base * 0.85) * 100 }] } : {}),
    ...(preOrder ? { preOrder: { enabled: true, shipsOn: new Date(Date.now() + 21 * DAY) } } : {}),
    ratingAvg: ratingCount ? Math.round((3.4 + rng.next() * 1.6) * 10) / 10 : 0,
    ratingCount,
    soldCount,
    viewCount: soldCount * rng.int(5, 20) + rng.int(40, 600),
    wishlistCount: Math.floor(soldCount * rng.next() * 0.3),
    isFeatured: rng.chance(0.12),
    ...(status === 'published' ? { publishedAt } : {}),
    demo: true,
    createdAt: publishedAt,
  });
  product.recomputeDerived();
  return product;
}

function realOptions(scheme: RealProduct['scheme']): OptionDef[] {
  switch (scheme) {
    case 'apparel':
      return [{ key: 'size', name: 'Size', values: ['S', 'M', 'L', 'XL'], priceStep: [0, 0, 0, 0.05] }];
    case 'shoe-men':
      return [{ key: 'shoeSize', name: 'Size', values: ['40', '41', '42', '43', '44'] }];
    case 'shoe-women':
      return [{ key: 'shoeSize', name: 'Size', values: ['36', '37', '38', '39', '40'] }];
    case 'none':
      return [];
  }
}

/** Stores a real photo (downloaded + re-hosted), or the SVG art when it is unavailable. */
async function storeProductImage(url: string, key: string, art: () => string): Promise<{ url: string; key: string }> {
  const img = realImagesEnabled() ? await loadSeedImage(url) : null;
  if (!img) return putSvg(`${key}.svg`, art());
  return getStorage().upload(img.buffer, { folder: 'seed', filename: key, mimetype: img.mimetype, fixedKey: `${key}.${img.ext}` });
}

/** A product from data/realProducts.ts (real photo), with the same demo mechanics as generateProduct. */
async function buildRealProduct(ctx: GenContext, item: RealProduct, i: number, count: number): Promise<ProductDoc> {
  const { store, seed, cats, brands, storeIndex } = ctx;
  const rng = createRng(hashString(`real:${seed.slug}:${item.title}`));
  const title = item.title;
  const slug = `${slugify(title)}-${shortId(`real:${seed.slug}:${i}`)}`;
  const topSeed = TOP_OF_SUB.get(item.sub)!;
  const sub = cats.get(item.sub)!;
  const top = cats.get(topSeed.slug)!;
  const brand = item.brand ? brands.get(item.brand) : undefined;

  // Pricing: USD list price → rupees; the listed discount becomes the compare-at price.
  const listRupees = item.usd * USD_TO_PKR;
  const base = roundPrice(listRupees * (1 - item.discountPct / 100));
  const hasCompare = item.discountPct >= 3 && roundPrice(listRupees) > base;
  const options = realOptions(item.scheme);

  const roll = rng.next();
  const stockProfile = roll < 0.05 ? 'out' : roll < 0.17 ? 'low' : 'normal';
  const variants: Partial<IVariant>[] = combos(options).map((c, vi) => {
    const price = roundPrice(base * c.factor) * 100;
    return {
      _id: new Types.ObjectId(),
      sku: `${seed.slug.replace(/[^a-z]/g, '').slice(0, 5).toUpperCase()}-R${String(i + 1).padStart(3, '0')}-${vi + 1}`,
      options: c.values,
      price,
      ...(hasCompare ? { compareAtPrice: roundPrice(listRupees * c.factor) * 100 } : {}),
      stock: stockProfile === 'out' ? 0 : stockProfile === 'low' ? rng.int(1, 3) : rng.int(8, 120),
      reserved: 0,
      isActive: true,
    };
  });

  const images = await Promise.all(
    item.images.map(async (url, n) => {
      const stored = await storeProductImage(url, `seed/products/${slug}-${n + 1}`, () =>
        productArt({ kind: topSeed.art, palette: topSeed.palette, label: title, brand: brand?.name ?? seed.name, variant: n }),
      );
      return { ...stored, alt: `${title} — image ${n + 1}` };
    }),
  );

  const soldCount = Math.floor(Math.pow(rng.next(), 3) * 4200);
  const ratingCount = soldCount ? Math.max(1, Math.floor(soldCount * (0.05 + rng.next() * 0.25))) : 0;
  const publishedAt = new Date(Date.now() - rng.int(1, 120) * DAY - rng.int(0, 86_000) * 1000);
  const hasWarranty = ['mobiles-tablets', 'electronic-devices', 'vehicles', 'jewelry-watches'].includes(topSeed.slug);
  const status = (storeIndex === 0 || storeIndex === 5) && i === count - 2 ? 'draft' : storeIndex === 1 && i === count - 3 ? 'pending_review' : 'published';
  const preOrder = [2, 4, 11].includes(storeIndex) && i === count - 1;
  const wholesale = topSeed.slug === 'groceries' && i % 4 === 0;
  const tags = [...new Set([...item.tags, ...(brand ? [brand.name.toLowerCase()] : [])])];

  const description = sanitizeRichText(
    `<p>${escapeXml(item.description)}</p>` +
      `<h3>Why you'll love it</h3><ul>${item.highlights.map((h) => `<li>${escapeXml(h)}</li>`).join('')}</ul>` +
      `<p>Sold by ${escapeXml(seed.name)}, ${escapeXml(seed.city)}. Fast delivery across Pakistan; cash on delivery available on most orders.</p>`,
  );

  const product = new Product({
    storeId: store._id,
    title,
    slug,
    description,
    highlights: item.highlights,
    categoryId: sub._id,
    categoryPath: [top._id, sub._id],
    ...(brand ? { brandId: brand._id, brandName: brand.name } : {}),
    images,
    attributes: {},
    options: options.map((o) => ({ key: o.key, name: o.name, values: o.values })),
    variants,
    status,
    tags,
    searchText: buildSearchText({ title, brandName: brand?.name, tags }, [top.name.en, top.name.ur, top.name.ar, sub.name.en, sub.name.ur, sub.name.ar]),
    cod: topSeed.slug === 'vehicles' ? false : rng.chance(0.85),
    freeShipping: rng.chance(seed.isMall ? 0.6 : 0.3),
    shipping: { weightGrams: item.weightGrams, processingDays: rng.int(1, 3) },
    ...(hasWarranty ? { warranty: { type: 'brand', period: item.warranty ?? '1 year' } } : {}),
    returnPolicy: { days: 7, note: 'Unused items in original packaging.' },
    ...(item.scheme === 'apparel' ? { sizeGuide: sizeGuideHtml() } : {}),
    specs: [...(brand ? [{ label: 'Brand', value: brand.name }] : []), ...item.specs.map(([label, value]) => ({ label, value }))],
    ...(wholesale ? { wholesaleTiers: [{ minQty: 10, price: Math.round(base * 0.92) * 100 }, { minQty: 50, price: Math.round(base * 0.85) * 100 }] } : {}),
    ...(preOrder ? { preOrder: { enabled: true, shipsOn: new Date(Date.now() + 21 * DAY) } } : {}),
    ratingAvg: ratingCount ? Math.round(Math.min(5, Math.max(3.6, item.rating)) * 10) / 10 : 0,
    ratingCount,
    soldCount,
    viewCount: soldCount * rng.int(5, 20) + rng.int(40, 600),
    wishlistCount: Math.floor(soldCount * rng.next() * 0.3),
    isFeatured: rng.chance(0.12),
    ...(status === 'published' ? { publishedAt } : {}),
    demo: true,
    createdAt: publishedAt,
  });
  product.recomputeDerived();
  return product;
}

async function seedProductsForStore(ctx: GenContext): Promise<number> {
  if (await Product.exists({ storeId: ctx.store._id })) return 0;
  // Stores with real products (photos) sell only those; the others keep the generated catalog + SVG art.
  const real = REAL_PRODUCTS.filter((p) => p.store === ctx.seed.slug);
  const count = real.length || PRODUCTS_PER_STORE;
  const docs: ProductDoc[] = [];
  await pool(
    Array.from({ length: count }, (_, i) => i),
    6,
    async (i) => {
      docs.push(real.length ? await buildRealProduct(ctx, real[i]!, i, count) : await generateProduct(ctx, i));
    },
  );
  await Product.insertMany(docs);
  return docs.length;
}

/** Store counters derived from its products (idempotent). */
async function refreshStoreStats(store: StoreDoc): Promise<void> {
  const [row] = await Product.aggregate<{ n: number; rating: number; ratings: number }>([
    { $match: { storeId: store._id, status: 'published', deletedAt: { $exists: false } } },
    { $group: { _id: null, n: { $sum: 1 }, rating: { $avg: { $cond: [{ $gt: ['$ratingCount', 0] }, '$ratingAvg', null] } }, ratings: { $sum: '$ratingCount' } } },
  ]);
  await Store.updateOne(
    { _id: store._id },
    { $set: { productCount: row?.n ?? 0, ratingAvg: Math.round((row?.rating ?? 0) * 10) / 10, ratingCount: row?.ratings ?? 0 } },
  );
}

// ---------------------------------------------------------------------------------------------
// Home, flash sale, campaigns
// ---------------------------------------------------------------------------------------------

async function seedHome(): Promise<boolean> {
  if (await HomeContent.exists({ key: 'home' })) return false;
  const heroSlides = await Promise.all(
    HERO_SLIDES.map(async (h) => {
      const photos = await photosByTitle(h.photos);
      const svg =
        photos.length >= 2
          ? heroPhotoArt({ title: h.title, subtitle: h.subtitle, eyebrow: h.eyebrow, from: h.colors[0], to: h.colors[1], photos, badge: 'badge' in h ? h.badge : undefined })
          : heroArt(h.title, h.subtitle, h.colors[0], h.colors[1], h.motif);
      const img = await putSvg(`seed/home/hero-${h.key}.svg`, svg);
      return { image: img.url, title: h.title, subtitle: h.subtitle, ctaText: h.ctaText, ctaLink: h.ctaLink, theme: h.theme };
    }),
  );
  await HomeContent.create({
    key: 'home',
    heroSlides,
    sections: HOME_SECTIONS.map((s, order) => ({ type: s.type, title: s.title, enabled: true, order, config: { limit: 12 } })),
    demo: true,
  });
  return true;
}

async function seedFlashSale(): Promise<boolean> {
  const now = new Date();
  if (await FlashSale.exists({ demo: true, isActive: true, startsAt: { $lte: now }, endsAt: { $gt: now } })) return false;
  const rng = createRng(hashString('flash-sale'));
  const candidates = await Product.find({ demo: true, status: 'published', totalStock: { $gt: 5 } })
    .sort({ soldCount: -1 })
    .select('storeId priceMin')
    .limit(120)
    .lean();
  const perStore = new Map<string, number>();
  const picked = candidates.filter((p) => {
    const k = String(p.storeId);
    const n = perStore.get(k) ?? 0;
    if (n >= 2) return false;
    perStore.set(k, n + 1);
    return true;
  });
  const items = rng.shuffle(picked).slice(0, 16).map((p) => {
    const quantityLimit = rng.int(20, 100);
    return {
      productId: p._id,
      flashPrice: Math.max(100, Math.floor((p.priceMin * (0.55 + rng.next() * 0.2)) / 1000) * 1000 - 100),
      quantityLimit,
      sold: rng.int(0, Math.floor(quantityLimit * 0.8)),
    };
  });
  await FlashSale.create({
    title: 'Flash Sale',
    startsAt: new Date(now.getTime() - 3600_000),
    endsAt: new Date(now.getTime() + 23 * 3600_000),
    items,
    isActive: true,
    demo: true,
  });
  return true;
}

async function seedCampaignDocs(cats: Map<string, CategoryDoc>): Promise<number> {
  let created = 0;
  for (const c of seedCampaigns(new Date())) {
    if (await Campaign.exists({ slug: c.slug })) continue;
    const photos = await photosByTitle(c.photos);
    const svg =
      photos.length >= 2
        ? heroPhotoArt({ title: c.name, subtitle: c.description, eyebrow: c.eyebrow, from: c.colors[0], to: c.colors[1], photos, badge: 'badge' in c ? c.badge : undefined })
        : heroArt(c.name, c.description, c.colors[0], c.colors[1], c.motif);
    const banner = await putSvg(`seed/campaigns/${c.slug}.svg`, svg);
    await Campaign.create({
      slug: c.slug,
      name: c.name,
      theme: c.theme,
      banner: banner.url,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      description: c.description,
      categoryIds: c.categories.map((s) => cats.get(s)!._id),
      demo: true,
    });
    created++;
  }
  return created;
}

/** Seeds the whole demo catalog. Idempotent: existing documents (by slug/email) are kept. */
export async function seedCatalog(passwordHash: string): Promise<Record<string, number | boolean>> {
  const started = Date.now();
  const cats = await seedCategories();
  const brands = await seedBrands();
  let storesCreated = 0;
  let productsCreated = 0;
  for (const [storeIndex, seed] of SEED_STORES.entries()) {
    const { store, created } = await seedStore(seed, storeIndex, passwordHash, cats);
    if (created) storesCreated++;
    const cat = SEED_CATEGORIES.find((c) => c.slug === seed.category)!;
    productsCreated += await seedProductsForStore({ store, seed, storeIndex, cat, cats, brands });
    await refreshStoreStats(store);
  }
  const home = await seedHome();
  const flashSale = await seedFlashSale();
  const campaigns = await seedCampaignDocs(cats);

  invalidateCategoryCache();
  invalidateStoreIndex();
  invalidateFlashCache();
  invalidateHomeCache();
  invalidateVocabulary();
  const result = { categories: cats.size, brands: brands.size, storesCreated, productsCreated, home, flashSale, campaigns, ms: Date.now() - started };
  logger.info(result, 'Catalog seeded');
  return result;
}
