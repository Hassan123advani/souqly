# Phase 10 API — Seller growth

Base `/api/v1`. Seller routes: `requireAuth` + `storeContext` (`x-store-id` selects a membership); storeId comes ONLY from `req.store`. Money = paisa. Rates = bps.
Errors: `PLAN_LIMIT` (403, `details: { plan, limit, feature?, used?, max? }`), `FEATURE_DISABLED` (404), standard `VALIDATION_ERROR`, `NOT_FOUND` (cross-store ids always 404).

## 1. Marketing — `store.marketing.manage`
| Method | Path | Notes |
|---|---|---|
| GET/POST | `/seller/marketing/vouchers` | store vouchers; body: code,title?,type(percent/fixed/free_shipping),value,minSpend,maxDiscount?,startsAt,endsAt,usageLimit,perUserLimit,followerOnly,productIds[],categoryIds[],isActive |
| PATCH/DELETE | `/seller/marketing/vouchers/:id` | |
| GET/POST | `/seller/marketing/flash-deals` | `{title,startsAt,endsAt,items:[{productId,variantId?,price,quantityLimit}]}`; rules: window ≤ 14 days, price < variant price and ≥ 10% of it; a platform FlashSale on the same item always wins |
| PATCH/DELETE | `/seller/marketing/flash-deals/:id` | |
| GET/POST | `/seller/marketing/bundles` | `{name,items:[{productId,variantId?,qty}],bundlePrice,isActive,startsAt?,endsAt?}` (2–6 items) |
| PATCH/DELETE | `/seller/marketing/bundles/:id` | |
| GET/POST | `/seller/marketing/promotions` | `{type:'bxgy',name,buy:{productIds,qty},get:{productIds,qty,discountBps},startsAt,endsAt,isActive}` (10000 = free) |
| PATCH/DELETE | `/seller/marketing/promotions/:id` | |
| GET | `/seller/marketing/campaigns` | open platform campaigns (endsAt > now) + my nominations |
| POST | `/seller/marketing/campaigns/:id/nominations` | `{items:[{productId,campaignPrice}]}` → `pending` |
| GET/PUT | `/seller/marketing/featured` | `{productIds:[≤12]}` pinned list (store page "featured" section) |
| PATCH | `/admin/campaigns/:id/nominations/:nominationId` | admin `{status:'approved'|'rejected'}`; approved → product added to campaign.productIds |

Public: `GET /products/:slug/promotions` → `{ bundles[], promotions[], flashDeal? }`;
`GET /stores/:slug/share-image.svg`, `GET /products/:slug/share-image.svg` → 1200×630 branded SVG (no native libs for PNG; the `.png` paths 302 to `.svg`). Store/product public DTOs expose `ogImage` pointing at these.

Pricing order (pure, `orders/pricing.ts`): unit price (min of base, flash [platform > store deal], wholesale) → **promotions** (bundles then BXGY, per store, seller-funded, `promoDiscount`) → store voucher on the post-promo eligible amount → platform voucher → shipping → coins. Order `discounts.promo` stores it; commission base = items − promo − store voucher.

## 2. Finance — view `store.finance.view`, payout request `store.finance.manage`
- `GET /seller/finance/summary` → `{ available, onHold, pendingPayouts, lifetime, paidOut, refunds, holdDays, minPayout }`
- `GET /seller/finance/transactions?cursor=&limit=&type=` → SellerLedger entries `{type: sale|refund|payout|payout_reversal, amount (signed), ref, orderNumber?, availableAt, createdAt}`
- `GET /seller/finance/orders/:id/commission` → `{ subtotal, promo, storeDiscount, shipping, commissionBps, commission, sellerNet }`
- `POST /seller/finance/payout-requests {amount}` → 201 Payout (min Rs. 1,000 = 100000 paisa, ≤ available, needs payout method; masked snapshot)
- `GET /seller/finance/payout-requests?cursor=`
- `GET /seller/finance/statements?month=YYYY-MM&format=json|pdf|csv`
Ledger is written on delivered (hook) and reconciled idempotently (`unique(storeId, ref)`) from orders, returns and payouts on every finance read. Hold days: Setting `financeHoldDays` (default 7).

## 3. Analytics — `store.analytics.view` (`format=csv|pdf` needs Pro+)
`GET /seller/analytics?range=7d|30d|90d&format=` → `{ series[{date,sales,orders,units}], funnel{visits,productViews,addToCart,orders}, topProducts[{productId,title,revenue,units,views,conversion}], traffic[{source,views}], customers{new,returning} }`.
View endpoints accept `?ref=&utm_source=`. `AnalyticsEvent` daily counters (`add_to_cart`, `product_view`, `source`).

## 4. POS — `store.pos.use` (Pro+)
`GET /seller/pos/catalog?updatedSince=` · `GET /seller/pos/lookup?code=` · `POST /seller/pos/sales {sales:[≤50]}` → `{results:[{clientId,status:'created'|'duplicate'|'error',orderId?,number?,stockConflict?,error?}]}` · `GET /seller/pos/sales/:id/receipt` · `POST /seller/pos/shifts/open {openingCash}` · `POST /seller/pos/shifts/:id/close {countedCash}` · `GET /seller/pos/shifts` · Public `GET /r/:token` (HMAC token, items/totals only).
POS orders: `channel:'pos'`, `status:'delivered'`, no buyer (`buyerId` null), idempotent by `(storeId, posClientId)`.

## 5. CSV — `store.products.manage` (import Pro+)
`GET /seller/products/export.csv` · `GET /seller/products/import-template.csv` · `POST /seller/products/import[?dryRun=1]` multipart field `file` (≤ 2 MB, ≤ 1,000 rows). Columns: `product_title,sku,price,compare_at_price,stock,barcode,category_id,description,option1_name,option1_value,option2_name,option2_value,weight_grams`. Upsert by sku (existing → price/stock/barcode update; new → draft products grouped by `product_title`).

## 6. Health — `GET /seller/health` (`store.dashboard.view`), `POST /seller/health/recompute`. Nightly job `storeHealth.recompute`.

## 7. Plans — `GET /seller/plan`, `POST /seller/plan/request {plan}`; admin `GET /admin/plan-requests`, `PATCH /admin/plan-requests/:id {status}`.

## 8. Affiliate (flag `affiliateLinks`) — `GET /affiliate/link?productId=` → `{url, code}`; checkout body accepts `aff` (or cookie `sq_aff`); `AffiliateCommission` 2% of item value credited to wallet on delivery (idempotent per order). `GET /affiliate/commissions`.

## 9. Admin follow-ups (D-076)
`GET /admin/plan-requests?status=` · `PATCH /admin/plan-requests/:id {status, note?}` · `PATCH /admin/campaigns/:id/nominations/:nominationId {status}` ·
`GET /admin/dashboard` → adds `previous` + `deltas` · `GET /admin/email-templates/:key/default` · `GET /admin/staff/assignable?permission=admin.support.manage` ·
`GET /admin/settings/payments` → `{toggles, integrations, methods[{method, enabled, configured, available}]}` · admin lists `?sort=` (users `wallet`, stores `followers`, orders `total`, products `best_selling`, plus `newest|oldest`).
Display names added: flash-sale `items[].product`, `/admin/cms/home` `featured.products|stores|categories`, commission rules `category|store`, payout review responses `storeName`.
