# API contract — Phase 3 & 4 (catalog, marketplace, search, store pages)

Conventions from CLAUDE.md apply. Money = integer minor units. Cursor pagination `?cursor=&limit=` → `meta.nextCursor`.

## Models (server/src/modules/catalog/*)
- **Category** `{ name: {en, ur, ar}, slug (unique), parentId|null, ancestors: [{_id, slug, name}], icon (lucide icon name), image?, color?, order, attributes: [AttributeDef], commissionBps?, isActive, demo }` — index `{parentId, order}`, `{slug}`.
- **AttributeDef** (embedded) `{ key, label:{en,ur,ar}, type: 'text'|'number'|'select'|'multiselect'|'color'|'size', options?: string[], filterable: boolean, variantDefining: boolean, unit? }`.
- **Brand** `{ name, slug (unique), logo?, description?, isFeatured, demo }`.
- **Product** `{ storeId, title, slug (unique: `${slugify(title)}-${shortId}`), description (sanitized HTML), highlights: string[], categoryId, categoryPath: ObjectId[] (ancestors + self, for subtree filters), brandId?, brandName?, images: [{url, key, alt}], video?: {url, key}, attributes: Record<string, string|string[]|number>, options: [{key, name, values[]}] (e.g. Color, Size), variants: [{ _id, sku, options: Record<string,string>, price, compareAtPrice?, stock, reserved, images?: string[], barcode?, weightGrams?, isActive }], priceMin, priceMax, compareAtMax, discountPct (max across variants, denormalized), totalStock, status (PRODUCT_STATUSES), moderationNote?, tags: string[], searchText (normalized lowercase title+brand+tags+category names, for fuzzy), cod: boolean, freeShipping: boolean, shipping: {weightGrams, dimensionsCm?, processingDays}, warranty?: {type, period}, returnPolicy?: {days, note}, sizeGuide?: html, specs: [{label, value}], wholesaleTiers?: [{minQty, price}], preOrder?: {enabled, shipsOn}, ratingAvg, ratingCount, soldCount, viewCount, wishlistCount, isFeatured, publishedAt, demo, timestamps }`
  - Indexes: `{storeId, status, createdAt:-1}`, `{status, categoryPath, priceMin}`, `{status, soldCount:-1}`, `{status, publishedAt:-1}`, `{status, ratingAvg:-1}`, `{status, discountPct:-1}`, text index on `title (w10), brandName (w5), tags (w3), searchText`, `{slug}` unique, `{"variants.sku": 1, storeId: 1}`, `{"variants.barcode": 1, storeId: 1}`.
- **Store** (extend Phase-2 model) `{ ownerId, name, slug (unique), tagline, description, logo, banner, themeColor, categoryIds, status (STORE_STATUSES), rejectionReason?, isMall (verified), mallRequested, contact: {email, phone, whatsapp}, address (pickup), policies: {shipping, returns, warranty} (sanitized html), layoutTemplate: 'classic'|'bold'|'boutique'|'minimal', sections: [{type: 'hero'|'featured'|'category_row'|'deals'|'new_arrivals'|'best_sellers'|'banner'|'text', title?, config}], seo: {title, description}, holidayMode: {enabled, message, until?}, ratingAvg, ratingCount, followerCount, productCount, responseRate, responseTimeHours, healthScore, plan: 'free'|'pro'|'business', business: {...}, payout: {...}, demo }` — indexes `{slug}`, `{status, isMall}`, `{status, followerCount:-1}`, text on `name`.
- **HomeContent** (CMS; admin-managed, Phase 9 editor; seeded now) `{ key: 'home', heroSlides: [{image, title, subtitle, ctaText, ctaLink, theme}], sections: [{type, title, enabled, order, config}] }`.
- **FlashSale** `{ title, startsAt, endsAt, items: [{productId, variantId?, flashPrice, quantityLimit, sold}], isActive }`.
- **Campaign** `{ slug, name, theme, banner, startsAt, endsAt, description, productIds?, categoryIds?, storeIds? }`.
- **SearchLog** `{ userId?, q, normalized, resultCount, createdAt (TTL 90d) }` → trending searches aggregate.
- **RecentlyViewed** handled per user `{ userId, productId, viewedAt }` (cap 50), guests via localStorage.

## Public endpoints
- `GET /catalog/categories` → full active tree (cached in memory 60s) `{ data: CategoryNode[] }` with children.
- `GET /catalog/categories/:slug` → `{ data: { category, breadcrumbs, children, filters: FacetDefs } }`.
- `GET /catalog/brands?featured=1` · `GET /catalog/brands/:slug`.
- `GET /products` — query: `q, category (slug, includes subtree), brand (csv slugs), store (slug), priceMin, priceMax, rating (min), city, freeShipping, cod, discount (min %), inStock, mall, color, size, attrs[key]=v, sort: relevance|newest|price_asc|price_desc|best_selling|top_rated|discount, cursor, limit` → `{ data: ProductCard[], meta: { nextCursor, total? (only first page), facets?: { brands, priceRange, ratings, colors, sizes } (only when facets=1) } }`.
- `ProductCard = { id, slug, title, image, price, compareAtPrice?, discountPct, ratingAvg, ratingCount, soldCount, freeShipping, cod, isMall, store: {slug, name}, stockLeft?: number (only when < 10), flash?: {price, endsAt} }`.
- `GET /products/:slug` → full product + `store` summary card `{id, slug, name, logo, ratingAvg, followerCount, responseRate, isMall, joinedAt, productCount}` + breadcrumbs. Increments viewCount (debounced per session) and records recently viewed for logged-in users.
- `GET /products/:slug/related` (same category), `/products/:slug/more-from-store`, `/products/:slug/bought-together` (co-occurrence in orders, fallback same-store same-category).
- `GET /products/feed/just-for-you?cursor=` — infinite feed (personalized: recent categories of viewed products when logged in; else trending mix).
- `GET /home` → `{ data: { heroSlides, categories (top-level), flashSale: {endsAt, items: ProductCard[]}, sections: [{type: 'trending'|'new_arrivals'|'top_rated'|'best_sellers'|'mall'|'top_stores'|'campaign', title, items}] } }` (single round trip; cached 30s).
- `GET /search/suggest?q=` → `{ data: { products: [{slug, title, image, price}], stores: [{slug, name, logo, isMall}], categories: [{slug, name}], didYouMean?: string } }` (rate limited).
- `GET /search/trending` → top normalized queries in last 7 days (fallback curated list). `GET /search/history` / `DELETE /search/history` (auth).
- `GET /stores?q=&mall=1&sort=followers|rating|new` → store cards. `GET /stores/:slug` → public store (no business/payout fields!) `GET /stores/:slug/products` (same filters as /products, scoped) `GET /stores/:slug/categories` (categories that the store's products are in, with counts).
- `GET /campaigns/:slug` · `GET /flash-sales/current`.
- `GET /recently-viewed` (auth).

## Seller endpoints (Phase 5, scoped by storeContext)
- `GET/POST /seller/products`, `GET/PATCH/DELETE /seller/products/:id`, `POST /seller/products/:id/duplicate`, `POST /seller/products/:id/publish` (→ `pending_review` unless store is trusted/auto-approve setting → `published`), `POST /seller/uploads` (image ≤ 5MB jpg/png/webp/avif, video ≤ 30MB mp4/webm).

## Search algorithm (D-008)
1. Normalize q (lowercase, strip diacritics, collapse spaces). 2. If `$text` returns results → sort by textScore blended with soldCount/rating. 3. Else fuzzy: build regex allowing one char gap per token against `searchText`. 4. If still zero → compute "did you mean" via Levenshtein ≤ 2 against an in-memory vocabulary (category names, brand names, store names, frequent title tokens; rebuilt every 10 min) and return results for the suggestion plus `meta.didYouMean`.
