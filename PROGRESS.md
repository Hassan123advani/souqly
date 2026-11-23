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

## In progress
- Phase 5+6 BACKEND (backend-dev) per docs/api-seller-orders.md + Phase-4 API gaps (store city, defaultVariantId, facet exclusion, single history delete).
- Client adopting security API changes (google 2FA step, recovery codes, reauth, pending phone).

## Next
1. Commit both; Phase 5+6 FRONTEND (seller onboarding wizard, Seller Center core, cart, checkout, orders).
2. Then code-reviewer + qa-tester pass on Phases 1–6.
3. Phase 7 onward.

## Dev notes
- Port 5173 is used by an unrelated project on this machine (digital-khata) — never kill it; Vite picks another port.

## Known issues
- Google 2FA redirect (`/login?google2fa=`) does not carry the original `next` path (server google.ts) — fix in Phase 12.
- Seed banners have English text baked into images (untranslated in ur/ar) — replace with text-free art + CMS text (Phase 9/12).
- Security findings H1–H3, M1–M6, L1–L11 open (see docs/reviews/security-phase-1-2.md).
