# Security review — billing, Phase 10, Vercel (commits 5b3578d, d008919)

_2026-11-24 · security-reviewer · status: OPEN_

Holds up: seller isolation (`req.store._id` everywhere), admin `can()` + no-impersonation, Zod `.strict()` bodies, invoice payment `$inc` capped inside `withTx` + per-store lock, unique indexes (renewal/period, open upgrade, pending payment, Stripe ids, manual ref, idempotency key), atomic pay-from-balance, server-side commission, Stripe webhook (raw body, constant-time HMAC, tolerance, amount/currency), cron auth, signed receipt tokens, CSV formula-injection guard, billing suspension in index/search/cart/checkout/publish.

## High
- **H1 Impersonating admin can redirect payout account / move seller money.** `onboarding/onboarding.routes.ts:63-72` (PATCH /seller/store/payout), `finance/finance.routes.ts:49-54` (POST payout-requests), `billing/billing.routes.ts:47-61,92-100` (change-plan, cancel, pay, DELETE scheduled-change), business-info PATCH. `forbidWhileImpersonating` only used in account routes. Fix: block every mutating /seller/finance, /seller/billing, payout-account and business-info route while impersonating; test.
- **H2 ADMIN can comp paid plans without billing permission.** `admin/stores.routes.ts:203` (PATCH /admin/stores/:id/plan) and `plans/plan.routes.ts:33-37` (approve plan request) call `adminSetPlan` with only ADMIN_STORES_MANAGE. Fix: require ADMIN_BILLING_MANAGE (or 409 → /admin/billing/stores/:id/plan); test ADMIN gets 403.

## Medium
- **M1 Payouts while invoices unpaid / store billing-suspended.** `finance/finance.service.ts:173-204`, `billing/billing.service.ts:244-268` (balance_transfer credit at issuance). Fix: inside the locked tx reject payouts when suspended or open/overdue invoices exist (or cap at available − outstanding); optionally auto-pay overdue invoices from balance in the sweep.
- **M2 Commission evasion via shipping fee.** `shared/src/schemas/seller.ts:179`, `billing/commission.service.ts:24`. Fix: platform-setting cap on zone rates (default Rs 1,500) and/or include shipping above cap in the base; flag shipping ≫ subtotal.
- **M3 Affiliate commission not clawed back on return/refund; store members can be affiliates.** `affiliate/affiliate.service.ts:56-72`, `orders/order.service.ts:170-172`. Fix: keep pending until hold/return window passes or debit wallet `affiliate_reversal:<orderId>`; exclude the order store's members.
- **M4 Rate limiting on Vercel.** `config/env.ts:79,148`, `middleware/rateLimit.ts`. Fix: require TRUST_PROXY (hop count) when SERVERLESS && production; Mongo-backed (or Redis when REDIS_URL) store for login/OTP/reset limiters.
- **M5 No security headers on the SPA.** `vercel.json:25-34`. Fix: headers for `/(.*)`: CSP (frame-ancestors 'none'; allow Google Fonts, Firebase/GA, OSM tiles, Cloudinary), X-Frame-Options DENY, nosniff, Referrer-Policy strict-origin-when-cross-origin, HSTS, Permissions-Policy (geolocation self for rider).
- **M6 Secrets in URLs sent to GA.** `components/layout/CookieConsent.tsx:21`, `lib/analytics.ts:64`. Fix: send path without query, redact `/r/:token`, skip auth routes (reset-password, verify-email, login?google2fa).
- **M7 Billing sweep can starve enforcement on serverless (60s).** `billing/billing.service.ts:546-574`, `services/jobs/sweeps.ts`. Fix: markOverdue first / own cron path; time-boxed batches with cursor (stop ~45s), fair ordering.
- **M8 Plan features stay active while billing-suspended.** `plans/plan.service.ts:57-73`. Fix: treat overdue-suspended as Free for feature gates (viewing + paying still allowed).
- **M9 Payment proofs public; Cloudinary account not bound.** `onboarding/media.ts:16`, `billing/billingPayments.service.ts:104`. Fix: bind URL to `/{CLOUDINARY_CLOUD_NAME}/`; private/authenticated assets via short-lived signed URL from scoped endpoints.

## Low
- **L1** Ledger refund debits written outside the store lock (`finance.service.ts:24-31,50-88`) → re-derive inside locked tx.
- **L2** Commission over-reversal race (`commission.service.ts:164-199`) → lock / re-sum and cap inside tx.
- **L3** markOverdue not transactional (`billing.service.ts:309-333`) → overdue+suspend in one locked tx, re-check.
- **L4** Global `refLock` uniqueness leaks other stores' refs; not unset on cancel (`billingPayment.model.ts:58`) → per-store lock + admin-side duplicate flag; unset on cancel.
- **L5** Idempotency replay ignores invoiceId (`billingPayments.service.ts:62-65`) → include invoiceId, 409 on mismatch.
- **L6** Suspended stores' products still served by `/products/:slug/promotions`, `share-image.svg`, search vocabulary → filter by `getPublicStoreIndex()`.
- **L7** POS sync accepts closed/other cashier shifts and any backdate (`pos.service.ts:110-111`) → own open shift, ≤7 days backdate.
- **L8** COD commission depends on seller-set delivered status → monitor cancelled-after-shipped rate; flag stale shipped COD orders.
- **L9** /seller/finance reads run full reconcile+sync every request → reuse throttledSync.
- **L10** `csvCell` prefixes negative numbers (`lib/csv.ts:10`) → skip for numbers.
- **L11** Empty bodies not validated (billing cancel, scheduled-change DELETE, admin sweep) → `z.object({}).strict()`.

## Info
VITE_FIREBASE_* public by design; consent gating correct; cookies Secure/Lax; serverless uploads fail closed. Verify on a Vercel preview that the Stripe webhook receives the untouched raw body.
