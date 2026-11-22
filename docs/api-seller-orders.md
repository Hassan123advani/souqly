# API contract — Phase 5 (seller onboarding + Seller Center core) & Phase 6 (cart, checkout, orders)

Conventions from CLAUDE.md apply. All `/seller/*` routes: `requireAuth` + `storeContext` + `requirePermission(...)`; storeId ONLY from `req.store`.

## Phase 5 — Seller onboarding
- `GET /stores/slug-available?slug=` → `{ data: { available, reason?: 'invalid'|'reserved'|'taken', suggestion? } }` (rate limited).
- `POST /seller/onboarding` (requireAuth only; user must not already own a store) body:
  `{ name, slug, tagline?, categoryIds[], themeColor, logo?: {url,key}, banner?: {url,key}, contact: {email, phone, whatsapp?}, pickupAddress: AddressInput, business: { type: 'individual'|'company', legalName, cnicOrRegNo, ntn?, idDocument?: {url,key} }, payout: { method: 'bank'|'jazzcash'|'easypaisa', accountTitle, accountNumber, bankName?, iban? }, policies?: {shipping, returns, warranty}, acceptTerms: true }`
  → creates Store `status: 'pending'` + StoreMember OWNER, sets `user.isSeller = true`, `activeMode = 'seller'`. `business.cnicOrRegNo` and `payout.accountNumber/iban` are encrypted at rest (AES-GCM helper) and only ever returned masked (`****1234`). Audit log. Notifies admins (in-app notification once Phase 7 exists; for now audit + console email to ADMIN_EMAIL).
- Upload during onboarding uses `POST /account/uploads` (requireAuth, images ≤ 5MB) — or allow `/seller/uploads` for users without a store? → **Decision: `POST /uploads/temp`** (requireAuth, images/pdf ≤ 5MB, folder `tmp/{userId}`), referenced by key in onboarding.
- `GET /seller/store` → full own store incl. masked business/payout, `status`, `rejectionReason`, onboarding checklist `{ logo, banner, firstProduct, policies, payout, shipping }` booleans.
- `PATCH /seller/store` (STORE_SETTINGS_MANAGE): name/tagline/description/logo/banner/themeColor/contact/policies/seo/layoutTemplate/sections/holidayMode/categoryIds. Slug change allowed once per 30 days.
- `PATCH /seller/store/payout` (STORE_FINANCE_MANAGE), `PATCH /seller/store/business` (OWNER only) → sets status back to `pending` re-review if store was `rejected`.
- `POST /seller/store/mall-request` → `mallRequested: true`.

## Seller Center core
- Dashboard: `GET /seller/dashboard?range=7d|30d|90d` → `{ kpis: { sales, orders, visitors, conversion, avgOrderValue } with deltas, salesSeries: [{date, sales, orders}], todo: { toConfirm, toPack, toShip, returnRequests, lowStock, unansweredQuestions, unreadChats }, healthScore: { score, factors: [{key, value, weight}] }, recentOrders[] }`.
- Products (exist from Phase 3) + `GET /seller/products?status=&q=&cursor=` with counts per status tab.
- Inventory: `GET /seller/inventory?lowStock=1&q=` (variant rows: product, sku, options, stock, reserved, warehouse stock), `POST /seller/inventory/adjust { productId, variantId, warehouseId?, delta, reason: 'restock'|'damage'|'correction'|'return'|'other', note? }` (atomic `$inc`, never below 0) → creates `StockMovement {storeId, productId, variantId, warehouseId, delta, reason, note, ref?: {type:'order'|'pos'|'adjustment', id}, actorId, balanceAfter}`; `GET /seller/inventory/movements?productId=&cursor=`; Warehouses CRUD `/seller/warehouses` (`{storeId, name, address, isDefault}`; variant stock per warehouse stored in `Product.variants[].warehouseStock: [{warehouseId, qty}]`, total `stock` = sum). Low-stock threshold per store setting (default 5).
- Staff & roles: `GET /seller/staff`, `POST /seller/staff/invite { email, role | customRoleId }` (existing user by email → StoreMember `status: 'invited'`, they accept via `POST /seller/invitations/:id/accept`; unknown email → console email with signup link), `PATCH /seller/staff/:memberId`, `DELETE /seller/staff/:memberId` (cannot remove OWNER), custom roles `GET/POST/PATCH/DELETE /seller/roles` (`{storeId, name, permissions: store.* only}`), `GET /seller/activity?cursor=` (store-scoped audit log).
- Settings: shipping `GET/PUT /seller/settings/shipping` → `{ zones: [{ name, cities: string[] | 'all', rate, freeAbove?, etaDays: [min,max] }], processingDays }`; notifications prefs; chat quick replies/auto-reply (Phase 8 uses them).

## Phase 6 — Cart
Server cart for logged-in users; guest cart in localStorage merged on login.
- `GET /cart` → `{ data: { groups: [{ store: {id, slug, name, logo, isMall}, items: [CartItem], subtotal, shipping, storeVoucher? }], summary: { itemsSubtotal, shippingTotal, discountTotal, platformVoucher?, total, savings }, freeShippingProgress: [{storeId, remaining}], issues: [{itemId, type: 'out_of_stock'|'price_changed'|'qty_reduced'|'unavailable'}] } }`
- `CartItem = { id, productId, variantId, slug, title, image, options, price, compareAtPrice?, qty, maxQty, selected, savedForLater }`.
- `POST /cart/items { productId, variantId, qty }`, `PATCH /cart/items/:id { qty?, selected?, savedForLater? }`, `DELETE /cart/items/:id`, `POST /cart/select-all { selected }`, `POST /cart/merge { items: [{productId, variantId, qty}] }`.
- Vouchers: `POST /cart/vouchers { code }` / `DELETE /cart/vouchers/:code`. Voucher model `{ code (unique per scope), scope: 'platform'|'store', storeId?, type: 'percent'|'fixed'|'free_shipping', value (bps or minor), minSpend, maxDiscount?, startsAt, endsAt, usageLimit, perUserLimit, usedCount, followerOnly?, categoryIds?, productIds? }`.
- Pricing engine in `server/src/modules/orders/pricing.ts` — pure functions with unit tests: line totals, wholesale tiers, flash price, store voucher, platform voucher (prorated across stores by subtotal share, rounding remainder to the largest store), shipping per store (zone by buyer city; free above threshold; free_shipping voucher), coins redemption (Phase 8 hook, 0 for now).

## Checkout & order split
- `POST /checkout/preview { addressId, paymentMethod, notes?: Record<storeId,string>, coins?: number }` → same shape as cart summary but final, with per-store breakdown.
- `POST /checkout { addressId, paymentMethod, notes?, idempotencyKey }` →
  1. Re-price server-side (never trust client prices). 2. Atomically reserve stock per variant (`findOneAndUpdate` with `stock >= qty`, `$inc: {stock: -qty}`) — roll back already-decremented lines on any failure → 409 `STOCK_CHANGED` with details. 3. Create `Checkout {userId, number (SQ-YYMMDD-XXXXX), addressSnapshot, paymentMethod, paymentStatus, totals, orderIds, idempotencyKey (unique per user)}` + one `Order` per store `{ storeId, checkoutId, number (SQ-…-A/B), buyerId, items: [{productId, variantId, title, image, options, sku, price, qty, lineTotal}], subtotal, shippingFee, discounts: {store, platform}, total, commission: {bps, amount}, sellerNet, status: 'placed' (COD) | 'pending_payment' (online), timeline: [{status, at, by, note}], payment: {method, status}, shippingAddress, buyerNote, sellerNotes: [{by, at, text}], channel: 'online'|'pos', cancel?: {by, reason, at}, deliveryOtpHash?, riderId?, invoiceNumber }`. 4. Remove purchased items from cart, increment voucher usage, soldCount. 5. Emit socket `order:new` to the store room `store:{id}` (live alert with sound in Seller Center) and send emails (console).
  Same `idempotencyKey` returns the original checkout (no double order).
- Commission: `CommissionRule` resolution order store > category > global (seed global 10% = 1000 bps). Stored on the order at creation time.
- `GET /checkout/:number` (owner only) → success page data.

## Buyer orders
- `GET /orders?tab=to_pay|to_ship|to_receive|delivered|cancelled|returns&cursor=` (tabs from BUYER_ORDER_TABS) → sub-orders with store info.
- `GET /orders/:number` → detail + timeline + tracking steps.
- `POST /orders/:number/cancel { reason }` — allowed while `placed|confirmed` (buyer). Restores stock (StockMovement reason `return`/`cancel`).
- `POST /orders/:number/reorder` → adds available items to cart.
- `GET /orders/:number/invoice.pdf` (buyer, store members, admins) — PDFKit, branded.

## Seller orders
- `GET /seller/orders?status=&q=&from=&to=&cursor=` with per-status counts.
- `GET /seller/orders/:id`.
- `POST /seller/orders/:id/status { to: 'confirmed'|'packed'|'shipped'|'cancelled', note?, tracking?: {courier, trackingNumber} }` — validated with `canTransition`; cancel requires reason and restores stock.
- `POST /seller/orders/bulk-status { ids[], to }`.
- `POST /seller/orders/:id/notes { text }`.
- `GET /seller/orders/:id/invoice.pdf`, `GET /seller/orders/:id/label.pdf` (shipping label with QR of order number, 4x6in).
- `POST /seller/orders/:id/assign-rider { riderMemberId }` (Phase 7 uses it).
