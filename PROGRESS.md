# Progress

_Last updated: 2026-11-22_

## How to run
```bash
npm install
npm run dev        # client http://localhost:5173 · API http://localhost:4000
```
Admin: souqly@gmail.com / souqly123 (from server/.env)

## Phases
| # | Phase | Status |
|---|---|---|
| 1 | Agents, architecture, design system, skeleton, dev fallbacks | in progress |
| 2 | Auth & accounts, buyer/seller switch, admin seed + password change | todo |
| 3 | Catalog + uploads + seed data | todo |
| 4 | Marketplace front (home, category, search, product, store) | todo |
| 5 | Seller onboarding + Seller Center core | todo |
| 6 | Cart, checkout, order split, orders, invoices | todo |
| 7 | Tracking, notifications, Rider PWA, live map, OTP, returns | todo |
| 8 | Reviews, Q&A, follow, wishlist, chat, wallet, coins, referrals | todo |
| 9 | Super Admin panel | todo |
| 10 | Seller growth: marketing, finance, analytics, POS, bulk upload | todo |
| 11 | i18n + RTL, SEO, PWA, performance, accessibility | todo |
| 12 | Security review, full tests, polish, docs, final report | todo |

## Done
- Agents created in `.claude/agents/` (architect, ui-designer, frontend-dev, backend-dev, qa-tester, security-reviewer, code-reviewer).
- Root workspace, `shared/` package (roles, permissions, order statuses, locale, money, slug, auth/account schemas, API types + tests).
- CLAUDE.md, DECISIONS.md, docs/api-auth.md, docs/api-catalog.md.
- Phase 1+2 SERVER done & committed (a210fa2): env, in-memory Mongo fallback + auto-seed, storage/email/notify/payment/jobs services, socket auth, full auth + account API, 36 tests green.
- Security review of Phase 1–2 done → findings in docs/reviews/security-phase-1-2.md (OPEN).

- Phase 1+2 CLIENT done & committed (3bfb903): Souq Dusk design system, logo/PWA icons, UI kit, layouts, auth + account pages, en/ur/ar.
- Phase 3 BACKEND done & committed (5325716): catalog, search, stores, seller products, seed (12 stores, 216 products, flash sale, campaigns). 88 tests green.
- docs/api-seller-orders.md written (Phase 5 + 6 contract).

- Phase 4 marketplace front done & committed (329d453): home, mega-menu, categories, category/search/product/store/stores/mall/campaign/brand pages, local cart.
- All Phase 1–2 security findings fixed & committed (676ff20). 115 tests green.

- Client security flows committed (86b855a). Phase 5+6 BACKEND committed (210c73b): onboarding, Seller Center core, inventory, staff/custom roles, cart, vouchers, pricing, checkout split, orders, PDFs, seed orders. 173 tests.
- i18n now supports feature locale files `client/src/i18n/locales/<area>/<lang>.json` (deep-merged).

- Phase 7+8 BACKEND committed (361cba7). Phase 5+6 FRONTEND committed (6e03507). 214 tests.

## In progress (3 agents) — as of 2026-11-23
- Backend: follow-ups (coins refund, unreadChats, select-store, COD race, google2fa next, product counts, bulk, riders list, all attributes, newOrderSound) + Phase 9 admin API (docs/api-admin.md).
- Frontend Phase 7 (notifications center, tracking map, returns, Rider PWA /rider) — owns pages/rider, components/{rider,notifications,tracking,returns}, locales/delivery.
- Frontend Phase 8 (reviews, Q&A, follow, wishlist, chat, wallet/coins/referrals) — owns components/{reviews,qa,chat,wallet,wishlist}, pages/{chat,wishlist,wallet}, locales/social.
- Client polish noted: seller dashboard chart spikes with sparse data → use bars; store "category_row" section renderer should honor config.categoryId.

## Older notes (superseded)
- Phase 5 FRONTEND (Seller Center, onboarding wizard) — owns pages/seller, components/seller, api/seller.ts, locales/seller.
- Phase 6 FRONTEND (cart, checkout, buyer orders) — owns pages/cart|checkout|orders, api/cart|orders, locales/shop.
- Phase 7 BACKEND (notifications, rider API, live location, returns) — contract in docs/api-delivery.md.
- Phase 8 BACKEND (reviews, Q&A, follow, wishlist, chat, wallet, coins, referrals, gift cards) — contract in docs/api-social.md.

## Next
1. Commit each when green; Phase 7+8 FRONTEND (rider PWA /rider, tracking map, returns UI, notification center, reviews/Q&A, wishlist, chat, wallet/coins/referrals).
2. code-reviewer + qa-tester pass on Phases 1–8.
3. Phase 9 admin, 10 seller growth, 11 i18n/SEO/PWA/perf, 12 final.

## Dev notes
- Port 5173 is used by an unrelated project on this machine (digital-khata) — never kill it; Vite picks another port.

## Follow-ups (API gaps found by Phase 6 frontend)
- Bulk select endpoint for one store's cart items; add `chat`/`returns` flags (or remove client flags once Phase 7/8 UI lands); move `trackingSteps`/`canCancel` + CheckoutPreview + address snapshot types into shared; order items should carry `slug`; cart store groups could carry themeColor.
- BUG: coins spent on an order are not refunded on cancel/return — fix (refund coins in cancel + refund paths, idempotent).
- Seller dashboard `unreadChats` still 0 — wire `chat.service.unreadCount()`. Coins discount not shown in order DTO/screens.
- Admin moderation API/UI for reviews, reports, fraud signals → Phase 9.
- Phase 6 cart/checkout UI not yet screenshot-verified (agent hit low memory) — do in QA pass.

## Known issues
- Google 2FA redirect (`/login?google2fa=`) does not carry the original `next` path (server google.ts) — fix in Phase 12.
- Seed banners have English text baked into images (untranslated in ur/ar) — replace with text-free art + CMS text (Phase 9/12).
- Security findings H1–H3, M1–M6, L1–L11 open (see docs/reviews/security-phase-1-2.md).
