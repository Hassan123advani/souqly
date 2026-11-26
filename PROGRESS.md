# Progress

_Last updated: 2026-11-26_

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

- Phase 7 FE (5bfc948), Phase 8 FE (f2ebb32), Phase 9 BE + follow-ups 1–20 (9e74db5) committed. 238 tests.

## In progress — as of 2026-11-24
- Phase 10 BACKEND committed (5b3578d). Phase 10 FRONTEND done (uncommitted): marketing, analytics, offline POS, bulk CSV, health card, affiliate, admin nominations.
- Vercel deployment readiness done (uncommitted): vercel.json, api/index.mjs, server/src/vercel.ts, cron endpoint + sweep registry, realtime=false polling fallback on the client, docs/deploy-vercel.md.
- Cookie consent + Firebase Analytics (after consent) done (uncommitted).
- Keys connected locally: Cloudinary (server/.env), Firebase (client/.env), VAPID generated. MongoDB Atlas URI in server/.env.production.local (gitignored; local DNS can't resolve SRV, so MONGODB_URI_DIRECT is used for local seeding).
- RUNNING: owner's Seller Subscription + flat 15% commission + monthly invoice/billing system (backend first; contract docs/api-billing.md), replaces old plans (business→premium) and Seller Finance area.
- NEXT: billing frontend (seller billing/plans/finance pages, admin billing, wizard plan step; re-point growth 'not in your plan' card); backend follow-ups from Phase 10 FE: (1) /seller/health recommendations as i18n keys, (2) admin nominations list with product/store names, (3) sq_aff cookie (optional), (4) marketing lists should include product titles, (5) POS catalog updatedSince must report deleted ids; code + security review of Phase 10 + billing; commit; Phase 11; Phase 12; seed Atlas; push GitHub + Vercel deploy (owner asked explicitly on 2026-11-23).
- WAITING ON OWNER: gh auth login / empty repo, vercel login, strong production ADMIN_PASSWORD (12+), bank details for manual invoice payments.

- Automated store/product review by Claude (D-092) done, tests green, uncommitted: needs ANTHROPIC_API_KEY on Vercel + flag `aiAutoReview` on; code/security review pending.
- Seller subscriptions + flat 15% commission + monthly billing BACKEND done (uncommitted): contract docs/api-billing.md, decisions D-078..D-089, module server/src/modules/billing, Mongo replica set for transactions. Needs: billing FRONTEND (seller plan/billing pages, admin billing panel, wizard plan step), owner input on open questions (POS commission, admin goodwill refunds), Stripe keys for card invoice payments.

- Real products + photos in the demo seed (D-093, 2026-11-26): 194 real products (DummyJSON snapshot) with downloaded/re-hosted photos, new categories (Shoes/Bags/Eyewear, Motorbikes & Cars) and sub-categories, new store Raftar Motors, photo hero/campaign/store banners. Toys + books stores still use SVG art (no photo source yet).

## Previous in-progress notes
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
