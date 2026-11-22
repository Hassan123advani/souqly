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

## In progress
- Security fixes for docs/reviews/security-phase-1-2.md (backend-dev).
- Phase 4 marketplace front (frontend-dev) against docs/api-catalog.md.

## Next
1. Commit security fixes + Phase 4 once green; run code-reviewer + qa-tester on Phases 1–4.
2. Phase 5+6 backend (docs/api-seller-orders.md), then Phase 5+6 frontend.

## Dev notes
- Port 5173 is used by an unrelated project on this machine (digital-khata) — never kill it; Vite picks another port.

## Known issues
- Security findings H1–H3, M1–M6, L1–L11 open (see docs/reviews/security-phase-1-2.md).
