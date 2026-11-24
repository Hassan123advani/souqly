# Code review: Phase 10 + billing (commits 5b3578d, d008919; diff vs f7ac9b2)

Reviewer: code-reviewer. Scope: server billing/commission/finance/marketing/POS/analytics/affiliate/plans and client billing/growth/POS/polling/i18n.
Checks run: `npm run typecheck` passes (shared, server, client). `npm run lint` fails because `eslint` is not installed. i18n: billing/growth/consent keys match across en/ur/ar, and every literal `t("...")` key in the changed client files exists. RTL: the changed client files use no `ml-/mr-/pl-/pr-/left-/right-/text-left/right` classes.

Line numbers refer to d008919.

## High

### H1. Upgrades can charge twice for the same period (proration)
`server/src/modules/billing/billing.service.ts:370-390` (createUpgradeInvoice), `:153-160` (applyUpgrade)
- The credit is calculated when the invoice is **issued**, but the upgrade only takes effect when it is **paid**, up to `graceDays` later. If `currentPeriodEnd` passes in between, `renewOnce` issues a renewal invoice for the old plan for the next full period. Once the upgrade is paid, `applyUpgrade` starts a new period, but the old-plan renewal fee is still owed.
- If the current period’s renewal invoice is open but not yet due, the credit is 0. The seller still owes that full old-plan fee, though `applyUpgrade` replaces the period.
**Fix:** In `applyUpgrade`, at payment time, settle the superseded period. For each open/overdue renewal invoice whose `subscription` line covers that period, reduce the line (or add a negative line, or waive with a `BillingAdjustment`) by the unused part. Compute the proration credit from what was actually paid at settlement time.

### H2. Reversing waived or unpaid-invoiced commission pays the seller money they never paid
`server/src/modules/billing/commission.service.ts:121`, `billing.service.ts:234-238`
`status = fresh.status === "unpaid" ? "unpaid" : "credited"` treats `waived` and `invoiced` (the invoice is still open) the same as `paid`. When the charge was waived, the seller’s balance is credited for commission they never paid. When the invoice is still open and is later waived, the same leak happens.
**Fix:** Decide by the charge’s status. `paid` → credit. `waived` → reversal `waived`, no ledger credit. `invoiced` → keep the reversal `unpaid` and either credit it when that invoice is paid, or lower the open invoice (adjustment line).

### H3. An admin cannot override an overdue billing suspension
`billing.service.ts:299-306` (suspendForBilling), `:497-510` (adminSuspend)
`suspendForBilling` filters `billingStatus: {$ne: "suspended"}`. On a store already suspended for `overdue`, admin suspend returns 409 `ALREADY_SUSPENDED` and the reason stays `overdue`. `liftOverdueSuspension` then lifts the suspension automatically as soon as the seller pays, which defeats the admin hold.
**Fix:** When reason `admin` is requested, allow changing `billingSuspension.reason` from `overdue` to `admin` (conditional update on `billingSuspension.reason: "overdue"`).

### H4. Store flash deals: sales counters double-count and `quantityLimit` is not enforced
`server/src/modules/checkout/checkout.service.ts:324-332`, `marketing/promotions.service.ts:25`, `marketing/marketing.service.ts:211-223`
- Every `flash` line increments **both** the platform `FlashSale` counter and the `StoreFlashDeal` counter, whichever price actually won (`resolveFlashPrice`).
- `quantityLimit` is only checked as `sold >= limit` at quote time. One order of 50 units on a deal limited to 10 gets all 50 at the deal price, and concurrent checkouts can oversell. The `$inc` has no condition.
- The comment says the counter write is "idempotent". It is not: a retried `postCheckout` increments again.
**Fix:** Have the quote record the flash source (platform or store + deal id) on each line and increment only that counter. Use a conditional `$inc` (`items.sold <= limit - qty`) during checkout, inside the stock transaction. Cap the number of units sold at the deal price at the remaining quantity.

### H5. POS: stock decrement is not atomic with the sale (stock can be lost)
`server/src/modules/pos/pos.service.ts:123-190`
`Order.create` runs first, then the items are decremented one by one. If the process crashes or the request fails after the order is written, the client retries. The retry hits the `(storeId, pos.clientId)` duplicate and returns `duplicate` without ever decrementing stock. `decrementWithClamp` (`:88-99`) reads `stock` and ignores `reserved`, so the clamp can take stock that online orders have reserved. If the clamp `adjustStock` loses a race, it records `delta: 0` and does not decrement at all.
**Fix:** Write the order and the stock movements in one `withTx`, or store `pos.stockApplied` and re-apply on `duplicate` when it is false. The clamp should use `stock - reserved` with a conditional update.

## Medium

### M1. `adminExtend` breaks later billing periods
`billing.service.ts:483-495` together with `period.ts:226-231`
The extension moves `currentPeriodEnd` but keeps `anchorDay`. The next `addMonths(end, 1, anchorDay)` uses the month of the new end with the old anchor. Example: anchor 10, extended to the 15th → the next period is about 26 days. Anchor 31, extended to Feb 5 → Mar 31 (about 2 months).
**Fix:** Set `anchorDay: end.getUTCDate()` together with the extension.

### M2. `markOverdue` races with payments and can suspend a store that has paid
`billing.service.ts:309-333`
The status flip and the suspension run outside the store lock and outside a transaction. Possible order: the invoice is marked overdue, the payment then settles it and `liftOverdueSuspension` finds nothing to lift, and only then does `suspendForBilling` run. The result is a store suspended with no overdue invoice.
**Fix:** Inside `withTx` + `lockStoreFinance`, run the conditional open→overdue update and the suspension together, after re-checking that an overdue renewal still exists.

### M3. Catch-up renewals can suspend a store immediately
`billing.service.ts:258`
`dueDate = cutoff + graceDays`. After downtime, or when an admin runs the sweep for old periods, the due date is already in the past. `markOverdue` in the same sweep then suspends the store with no notice.
**Fix:** `dueDate = max(cutoff + grace, now + minNoticeDays)`.

### M4. Admin revenue figures overstate paid amounts
`server/src/modules/billing/billingRead.service.ts:230-239, 270`
`subscriptionRevenue` sums the full subscription lines of any `paid` invoice, including partially waived ones. The comment ("waived parts excluded pro rata") does not match the code. `codPaid = codCommission - unpaidCodCommission` counts `waived` COD as paid. `mrr` counts suspended, unpaid and admin-comped stores.
**Fix:** Weight each invoice by `amountPaid/total`, or track revenue from `BillingPayment`. Subtract `waived`.

### M5. Affiliate commission: crediting can silently fail, and refunds are never reversed
`server/src/modules/affiliate/affiliate.service.ts:56-72`, `orders/order.service.ts` (transition hook)
The status is set to `credited` **before** the wallet `credit`. If the credit throws, the error is logged and the commission is never retried. `voidAffiliateCommission` is only called on `cancelled`. Its comment says "refunded" too, and returns or refunds after delivery keep the 2%.
**Fix:** Credit the wallet first (the ref is idempotent), then flip the status, or run a sweep that retries `credited` rows without a wallet tx. Add a clawback or void on refund.

### M6. Commission sync rescans the whole store on every read (N+1)
`commission.service.ts:206-220`, `finance/finance.service.ts:50-53`, `billingRead.service.ts:325-339`
`reconcileLedger` → `syncCommissions(storeId)` reads every delivered order of the store, with no time window, on every finance read, statement, payout, balance payment and admin store view. Missing orders then call `recognizeCommission` / `syncOrderReversals` one by one (several queries each). `adminStoreDetail` runs the sync twice: directly, and again through `financeSummary`.
**Fix:** Add a window or a high-water mark per store (for example a `lastCommissionSyncAt` on Subscription), batch the queries, and drop the duplicate call in `adminStoreDetail`.

### M7. The global sweep has no indexes to use
`commission.service.ts:207, 216`
`Order.find({ updatedAt >= ... })` and `ReturnRequest.distinct("orderId", { updatedAt >= ..., status })` do not match any index (`order.model.ts:162-171`, `return.model.ts:82-86`), so each runs as a collection scan every 6 h.
**Fix:** Add `{ updatedAt: 1 }` on orders (or `{ status: 1, updatedAt: 1 }`) and `{ status: 1, updatedAt: 1 }` on returns.

### M8. The billing sweep is unlikely to finish within the Vercel 60 s limit
`billing.service.ts:546-574`, `services/jobs/sweeps.ts:28`
In one call, the sweep runs the migration, a global commission sync, `ensureSubscription` for each store, and `reconcileLedger` + `processStoreCycle` sequentially for every due store. There is no batching and no way to resume.
**Fix:** Process stores in bounded batches using a cursor or time budget, return `more: true`, and let cron call again. Move `migrateBilling` to boot only.

### M9. POS catalog delta sync can lose items
`server/src/modules/pos/pos.service.ts:44-51`, `client/src/components/seller/pos/usePosEngine.ts:134-140`
The server returns at most 5000 rows (`updatedAt` asc) but sets `serverTime = now`, so rows beyond 5000 are never fetched. Products updated between the query and `now` are also missed. Soft-deleted products are filtered out, so they are never removed from the local IndexedDB mirror.
**Fix:** When results are truncated, return `serverTime` = `updatedAt` of the last row, plus `hasMore`. Include tombstones (deleted/archived → `isActive:false` or delete). Snapshot `serverTime` before the query.

### M10. Admin billing report leaves out the last day of the range
`server/src/modules/admin/common.ts:20-26`
The comment says `to` is "inclusive of its day", but `to=2026-11-30` is parsed as midnight, so the 30th is excluded from `/admin/billing/report` (and other admin ranges).
**Fix:** When `to` has no time part, set `end = to + 1 day - 1 ms`.

### M11. Payment attempts stay `pending` after the invoice is settled another way
`server/src/modules/billing/billingPayments.service.ts:60-98`, `billing.service.ts:169-194`, `:527-543`
Paying from balance, or an admin waiver, does not cancel a pending manual/gateway payment on the invoice. A manual claim stays in the admin queue forever with its `refLock`, and approving it fails with `INVOICE_NOT_PAYABLE`.
**Fix:** When `addToInvoice` finalises an invoice, mark its pending payments `cancelled` (reviewNote "settled by ...") and unset `refLock`.

## Low

- **L1** `billing.service.ts:415-418`: on the `inv.total === 0` path, `.catch(() => ({settled:false}))` swallows errors and `afterSettlement` is never called (no audit, notification or store-index invalidation). With current prices this path cannot be reached; remove it or handle it properly.
- **L2** `billing.service.ts:397, 427`: the downgrade reads `sub` outside the lock, so `effectiveAt` can be stale if a renewal runs at the same moment. Read it inside the transaction.
- **L3** `billing.service.ts:379-381`: a period with no renewal invoice (for example an admin-comped plan via `adminSetPlan`) counts as "paid", so the upgrade gets a credit for time nobody paid for.
- **L4** `billing.service.ts:245-247`: `balance_recovery` uses `available`, which excludes on-hold sale credits. A seller whose on-hold credits will cover the negative balance is still billed for it. Consider `available + onHold`.
- **L5** `server/src/modules/bulk/productCsv.service.ts:210`: `PLANS[store.plan ?? "free"]` without `normalizePlan` (a legacy `business` plan gives undefined and a TypeError). It also duplicates `assertProductLimit`; add an `adding` argument and reuse that.
- **L6** `server/src/modules/analytics/analytics.routes.ts:25-27`: hand-built PLAN_LIMIT with a hard-coded `requiredPlan: "pro"`. Use `assertPlanFeature(store, "analyticsExport")`.
- **L7** `analytics.service.ts:55-113`: the funnel and product conversion count POS orders against online views. Pre-Phase-10 orders have no stored `channel`, so `channels.online` undercounts. Day buckets are UTC (orders between midnight and 5 am PKT land on the previous day). The buyers aggregation scans all store orders with no date limit.
- **L8** `analytics.service.ts:23-35`: concurrent first upserts on the unique index throw 11000 and the count is lost. Retry once on 11000.
- **L9** `plans/plan.service.ts:79-117`: limit checks count first and insert later, so concurrent creates or invites can exceed the limit. `:163-174`: the plan request is marked approved before `adminSetPlan`; if that fails, the request stays approved with no plan change.
- **L10** **FIXED (client)**: locale copy interpolates `{{pct}}` from `PLATFORM_COMMISSION_BPS` / `AFFILIATE_BPS` via `client/src/lib/rates.ts`; server line descriptions are the backend's part. Hard-coded rates in copy: `client/src/i18n/locales/billing/en.json:4,30,201` ("15%") and `growth/en.json:366` ("2%"), plus server invoice line descriptions. `AFFILIATE_BPS` exists only on the server. Move it to `@souqly/shared` and interpolate `commissionBps`.
- **L11** **FIXED**: `useInvoice` polls every 5 s (max 24 refetches) while a gateway payment is pending or after `?paid=1`; the page toasts, invalidates billing views and drops `?paid=1` once paid. `client/src/pages/seller/billing/InvoiceDetailPage.tsx`: after the Stripe return (`?paid=1`), nothing polls while the webhook is pending, so the invoice still shows open. Add `refetchInterval` while the pending payment is a gateway payment (with a limit).
- **L12** **FIXED**: polling is gated on `store.orders.view` (active store: resolved permissions; other stores: built-in role permissions) and covers every allowed store (max 5), like the socket path. `client/src/components/seller/OrderAlerts.tsx:43-50, 107`: polling calls `/seller/orders` without checking `store.orders.view` (staff without it get a 403 every 20 s), and only the active store gets alerts, unlike the socket path. Gate on the permission.
- **L13** **FIXED**: `setRealtimeAvailable` now runs in an effect. `client/src/api/config.ts` (`useRealtime`): calls `setRealtimeAvailable` during render. Move it into an effect.
- **L14** **FIXED**: `flush`/`refreshCatalog` never reject and stop when the DB was closed; a 400 VALIDATION_ERROR batch is resent one by one so only invalid sales are marked `error`. `usePosEngine.ts:155-194, 217-221`: a `flush` still running at unmount uses the closed DB, giving an unhandled rejection (`void flush()`). A 400 VALIDATION_ERROR marks the whole batch of 50 as `error`, valid sales included; retry one by one, or validate on the client before queueing.
- **L15** Tooling: `npm run lint` fails because `eslint` is not installed, so the "lint passes" part of the definition of done cannot be checked.

## Checked and OK
- Commission split rounding (`commissionSplit` with `applyBps` half-up, shipping excluded), the partial return formula (one return per order thanks to the unique `orderId` index), and the unique charge per order.
- Renewal invoicing: unique per `(storeId, periodStart)`, conditional unpaid→invoiced inside the transaction, store lock on balance spends and payouts.
- Webhook idempotency (txn/session unique indexes; the overpaid path is recorded).
- Billing-suspended stores are hidden from listings, search, suggestions and cart/checkout; publishing returns 403.
- Client billing mutations invalidate billing/plan/store/finance under the seller key; skeleton and error states are present on the billing pages reviewed.
