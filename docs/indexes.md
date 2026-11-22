# MongoDB indexes

Declared on the Mongoose schemas (built by `Model.init()` / autoIndex). Phase 1–2 indexes are listed in the model files; this page covers catalog (Phase 3).

| Collection | Index | Purpose |
|---|---|---|
| categories | `{slug: 1}` unique | lookup by slug |
| categories | `{parentId: 1, order: 1}` | tree / children |
| categories | `{demo: 1}` | seed:clear |
| brands | `{slug: 1}` unique | lookup by slug |
| brands | `{isFeatured: 1, name: 1}` | `?featured=1` list |
| products | `{slug: 1}` unique | product page |
| products | `{storeId: 1, status: 1, createdAt: -1}` | seller list, store page |
| products | `{status: 1, categoryPath: 1, priceMin: 1}` | category browse + price filter/sort |
| products | `{status: 1, soldCount: -1}` | best selling |
| products | `{status: 1, publishedAt: -1}` | newest |
| products | `{status: 1, ratingAvg: -1}` | top rated |
| products | `{status: 1, discountPct: -1}` | discount sort |
| products | `{status: 1, priceMin: 1}` | price sorts without category |
| products | text `product_text`: title (w10), brandName (w5), tags (w3), searchText (w1) | search step 1 (D-008) |
| products | `{"variants.sku": 1, storeId: 1}` | SKU lookup (POS / inventory) |
| products | `{"variants.barcode": 1, storeId: 1}` sparse | barcode scan (POS) |
| products | `{demo: 1}` | seed:clear |
| stores | `{slug: 1}` unique | store page |
| stores | `{ownerId: 1}`, `{status: 1}` | ownership, moderation |
| stores | `{status: 1, isMall: 1}` | Mall listing |
| stores | `{status: 1, followerCount: -1}` | `/stores?sort=followers`, top stores |
| stores | `{status: 1, ratingAvg: -1}` | `/stores?sort=rating` |
| stores | text `store_text` on name | store search |
| homecontents | `{key: 1}` unique | single home document |
| flashsales | `{isActive: 1, startsAt: 1, endsAt: 1}` | current flash sale |
| campaigns | `{slug: 1}` unique; `{startsAt: 1, endsAt: 1}` | campaign page, live/upcoming lists |
| searchlogs | `{createdAt: 1}` TTL 90 days | retention |
| searchlogs | `{userId: 1, createdAt: -1}` partial (userId exists) | search history |
| searchlogs | `{createdAt: -1, normalized: 1}` | trending (last 7 days) |
| recentlyvieweds | `{userId: 1, productId: 1}` unique | upsert per view |
| recentlyvieweds | `{userId: 1, viewedAt: -1}` | list + cap at 50 |

Notes
- The fuzzy layer (regex on `searchText`) is not index-assisted; it only runs when `$text` returns nothing. Swap for Atlas Search later (D-008).
- Public queries add `storeId: {$in: approvedStoreIds}` (D-018); with ~10³ stores that `$in` list is fine.
