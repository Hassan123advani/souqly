# Souqly API — Seller subscriptions, 15% commission & monthly billing

Contract for the seller plans / commission / invoicing system (owner spec "Shokly billing").
Base `/api/v1`. Success `{ data, meta? }`, errors `{ error: { code, message, details? } }`.
All money is integer **paisa** (Rs 1 = 100). Rates are basis points. Dates are ISO strings (UTC).
Lists use cursor pagination: `?cursor=&limit=` (limit 1..100, default 30) → `meta.nextCursor`.

Decisions are recorded in DECISIONS.md (D-078 … D-089).

---

## 1. Plans

| | Free | Pro | Premium |
|---|---|---|---|
| Monthly price | Rs 0 (`0`) | Rs 500 (`50_000`) | Rs 1,000 (`100_000`) |
| Products (non-deleted) / live (published + in review) | 50 | 1,000 | unlimited |
| Team members (non-owner, incl. invites) | 2 | 10 | 50 |
| Store page sections (section builder) | 4 | 12 | 20 |
| Store layout templates | `classic` only | all 4 | all 4 |
| Analytics | 7d / 30d | + 90d (`advancedAnalytics`) | same |
| Analytics export CSV/PDF | no | yes | yes |
| POS (offline point of sale) | no | yes | yes |
| Bulk CSV upload | no | yes | yes |
| Store vouchers | yes | yes | yes |
| Store flash deals | no | yes | yes |
| Bundles + Buy-X-Get-Y promotions | no | yes | yes |
| Featured products on store page | no | yes | yes |
| Priority support | no | no | yes |
| **Commission** | **15%** | **15%** | **15%** |

Shared source: `PLANS`, `STORE_PLANS = ['free','pro','premium']`, `PLATFORM_COMMISSION_BPS = 1500`
(`@souqly/shared`). The old `business` plan is renamed `premium` (startup + seed migration).
There is no plan commission discount any more.

```ts
type PlanFeature = 'analyticsExport' | 'advancedAnalytics' | 'pos' | 'bulkUpload' | 'flashDeals' | 'bundles'
  | 'featuredProducts' | 'layoutTemplates' | 'prioritySupport';
type PlanDefinition = {
  id: 'free' | 'pro' | 'premium'; name: string; priceMinor: number; interval: 'month';
  limits: { products: number | null; staff: number; storeSections: number };
  layouts: StoreLayout[];             // allowed layout templates
  features: Record<PlanFeature, boolean>;
};
```

Blocked actions return **403 `PLAN_LIMIT`** with `details: { plan, feature? | limit?, used?, max?, requiredPlan }`.
Downgrades never delete anything: over-limit products/sections/templates stay as they are, but new
products, new publishes beyond the live limit, new staff, and gated features are blocked.

---

## 2. Commission (15% flat)

* Rate: `PLATFORM_COMMISSION_BPS = 1500` for every plan. The old commission-rules engine
  (global/category/store) is **retired and locked**: rules are kept in the DB but never applied;
  admin create/update/delete and `PUT /admin/stores/:id/commission` answer **409 `COMMISSION_FIXED`**. A `commissionBps`
  field in admin category create/update is accepted for backward compatibility but **ignored** (never stored).
* Base = product subtotal − seller-funded discounts (store promo/bundles/BXGY + store voucher).
  **Shipping is excluded.** Platform-funded vouchers and coins do **not** reduce the base.
* `commission = round(base × 1500 / 10000)` (half-up, `applyBps`); `sellerNet = base + shipping − commission`.
  Examples: Rs 1,000 → 150 / 850 · Rs 2,000 COD → 300 / 1,700 · Rs 5,000 online → 750 / 4,250.
* Recognized only when a sub-order is **delivered** (successful), computed on the backend.
  Cancelled orders never get commission. POS (in-shop) sales are not marketplace sales → no commission.
* Exactly one charge per sub-order (unique index), reversals keyed by return id.

### CommissionEntry
```ts
type CommissionEntryDTO = {
  id: string; kind: 'charge' | 'reversal'; channel: 'cod' | 'online';
  orderId: string; orderNumber: string;
  base: number; bps: 1500; amount: number;   // charge > 0, reversal < 0
  orderTotal: number;
  status: 'unpaid' | 'invoiced' | 'paid' | 'deducted' | 'credited' | 'waived';
  invoiceId: string | null; invoiceNumber: string | null;
  reason: 'delivered' | 'return_refund' | 'cancelled_after_delivery';
  at: string; settledAt: string | null;
};
```
Status meaning:
* `deducted` — online order: commission was taken from the online payment before crediting the seller (85%).
* `unpaid` — COD receivable not yet on an invoice. `invoiced` — on an open invoice. `paid` — invoice paid.
* `credited` — a COD reversal for commission already invoiced/paid: returned to the seller's balance.
* `waived` — the invoice it was on was waived by an admin.

### Refund reversal
* Only seller-borne refunds (return refunds, incl. dispute refunds) reverse commission.
  Platform goodwill refunds (`POST /admin/orders/:id/refund`) do not (platform-funded).
* Full return (all units of the order returned) → the remaining commission is reversed exactly.
* Partial → `floor(charge × returnedItemsValue / subtotal)`, capped so total reversals ≤ charge (never negative).
* Forced admin cancel of a delivered order → full reversal.

### Money flow
* **COD**: the seller collects the full amount; the 15% becomes an `unpaid` receivable and is billed on the
  next monthly invoice. COD refunds paid to the buyer by Souqly are debited from the seller balance
  (seller holds the cash); a negative balance is recovered on the next monthly invoice (`balance_recovery` line).
* **Online** (gateway; hidden until keys exist): on delivery the seller balance is credited `sellerNet` (85% of base
  + shipping), available after the hold (`financeHoldDays`, default 7). Payouts unchanged (`/seller/finance/payout-requests`).

---

## 3. Subscription & billing cycle

```ts
type SubscriptionDTO = {
  plan: 'free' | 'pro' | 'premium';
  billingStatus: 'active' | 'suspended';
  suspension: { reason: 'overdue' | 'admin'; invoiceId: string | null; note: string | null; at: string } | null;
  currentPeriodStart: string; currentPeriodEnd: string;
  scheduledChange: { plan: StorePlan; effectiveAt: string; kind: 'downgrade' | 'cancel' } | null;
  pendingUpgrade: { plan: StorePlan; invoiceId: string; invoiceNumber: string; amountDue: number; dueDate: string } | null;
};
```

* Every store has one Subscription (created on onboarding / first billing touch) with **monthly** periods
  anchored on the start day (Jan 31 → Feb 28/29 → Mar 31). Free stores have periods too (for COD commission).
* **Daily billing sweep** (`billing.daily`, cron + in-process every 6 h; idempotent):
  1. recognizes missing commissions/reversals;
  2. for each subscription whose `currentPeriodEnd ≤ now`: applies a scheduled downgrade/cancel, then issues a
     **renewal invoice** for the next period: fee line for the plan active next period + one commission line with all
     `unpaid` COD entries recognized up to the cut-off (= old period end) + `balance_recovery` if the seller balance is
     negative. Each commission entry is linked to exactly one invoice. No invoice when the total is 0 (Free, no dues).
     Period advances by one month. `dueDate = cut-off + graceDays` (setting, default 7).
  3. renewal invoices past `dueDate` → `overdue` → store **billing-suspended** (`billingStatus='suspended'`,
     `suspension.reason='overdue'`). Upgrade invoices past due → `void` (the store simply keeps its plan) unless a manual
     payment for it is still waiting for review. Entries are billed by recognition date: a delivery or refund after the
     cut-off goes on the following invoice.
* Free sellers are never suspended for a subscription fee (there is none); only for unpaid commission dues past the deadline.
* **Billing suspension is separate from admin moderation suspension** (`store.status='suspended'`). While billing-suspended:
  storefront/products are hidden from public listings & search, cart marks lines `unavailable`, checkout rejects the store,
  publishing products is refused (403 `BILLING_SUSPENDED`). The seller can still log in, use the Seller Center, fulfil
  existing orders, view dues and pay. Paying all overdue renewal invoices lifts it automatically (reason `overdue` only;
  an admin billing suspension (`reason: 'admin'`) is lifted only by an admin).

### Plan changes
* **Upgrade** (free→pro/premium, pro→premium): creates an `upgrade` invoice; takes effect **when paid**: plan changes and a
  fresh monthly period starts at the payment time. Amount = new plan price − prorated credit for the unused part of the
  current period if it was paid (`floor(currentPrice × remainingMs / periodMs)`). Due in `graceDays`; unpaid → voided (no suspension).
  A new upgrade replaces (voids) an open one.
* **Downgrade** (premium→pro/free, pro→free): scheduled for `currentPeriodEnd`; voids any open upgrade invoice.
* **Cancel** = downgrade to Free at period end. `DELETE /seller/billing/scheduled-change` cancels a scheduled change and/or an open upgrade invoice.
* Outstanding invoices and unpaid commission are always carried regardless of plan changes.
* **Onboarding**: `POST /seller/onboarding` accepts `plan` (default `free`). The store is always created on Free;
  a paid choice creates a pending upgrade invoice (shown in Seller Center billing) that activates the plan when paid.

---

## 4. Invoices & payments

All response shapes are exported from `@souqly/shared` (`shared/src/types/billing.ts`): `SubscriptionDTO`, `InvoiceDTO`,
`InvoiceLineDTO`, `InvoiceDetailDTO`, `CommissionEntryDTO`, `InvoicePaymentDTO`, `BillingSummaryDTO`, `PlansCatalogDTO`,
`PublicPlansDTO`, `PaymentOptionsDTO`, `ChangePlanResultDTO`, `AdminBillingOverviewDTO`, `AdminBillingStoreRowDTO`,
`AdminBillingStoreDetailDTO`, `BillingAdjustmentDTO`, `BillingReportDTO`. The server builders are typed against them.
`GET /seller/store` (SellerStore) carries `billingStatus` + `billingSuspension { reason, at } | null` for the banner.

```ts
type InvoiceLine = { type: 'subscription' | 'commission' | 'proration_credit' | 'balance_recovery'; description: string; amount: number;
  plan?: StorePlan; periodStart?: string; periodEnd?: string; entries?: number };
type InvoiceDTO = {
  id: string; number: string;            // SB-YYMM-XXXXXX
  kind: 'renewal' | 'upgrade';
  status: 'open' | 'overdue' | 'paid' | 'waived' | 'void';
  plan: StorePlan; periodStart: string; periodEnd: string;
  lines: InvoiceLine[]; total: number; amountPaid: number; amountWaived: number; amountDue: number;
  issuedAt: string; dueDate: string; paidAt: string | null; voidedAt: string | null; voidReason: string | null;
  pendingPayment: { id: string; method: 'manual' | 'gateway'; createdAt: string } | null;
  store?: { id: string; name: string; slug: string };     // admin only
};
type InvoicePaymentDTO = {
  id: string; invoiceId: string; invoiceNumber: string; method: 'balance' | 'manual' | 'gateway' | 'admin';
  amount: number; status: 'pending' | 'succeeded' | 'rejected' | 'failed' | 'cancelled';
  channel: 'bank' | 'jazzcash' | 'easypaisa' | 'other' | null; reference: string | null;
  proofUrl: string | null; note: string | null; reviewNote: string | null;
  createdAt: string; reviewedAt: string | null;
  checkoutUrl?: string;   // gateway only, while pending
};
```

Invoice state machine: `open → paid | waived | overdue | void`; `overdue → paid | waived`. `void` only for upgrade invoices
(expired / replaced / cancelled). Fully paid → linked commission entries `paid`, upgrade applied, suspension lifted.

**Payment methods** (`POST /seller/billing/invoices/:id/pay`):
* `{ method: 'balance', idempotencyKey? }` — atomic transfer from the available Souqly balance (must cover the full amount due;
  400 `INSUFFICIENT_BALANCE` with `details.available`). Ledger debit `invoice_payment:<paymentId>`.
* `{ method: 'manual', channel: 'bank'|'jazzcash'|'easypaisa'|'other', reference (3..80), proof?: {url,key}, note? }` — the
  seller transferred to a Souqly account (see `/seller/billing/payment-options`) and submits the transaction reference (+ optional
  proof uploaded via `POST /uploads/temp`). Creates a `pending` payment for the full amount due → admin approves/rejects.
  One pending manual payment per invoice (409 `PAYMENT_PENDING`); a reference can't be reused (409 `DUPLICATE_REFERENCE`).
* `{ method: 'gateway', provider: 'stripe' }` — creates a hosted checkout (201 with `checkoutUrl`); the invoice is paid only by the
  signature-verified webhook. Without keys: **503 `PAYMENT_NOT_CONFIGURED`**, `details: { provider, requiredEnv: ['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET'] }`.
  JazzCash/EasyPaisa invoice checkout is not built (needs merchant integration) → same 503 with their env names.
* Partial payments: sellers always pay the full amount due; admins may approve a manual payment for a smaller verified
  amount (partial) — the invoice stays open/overdue for the rest.
* Errors: 404 (foreign/unknown invoice), 409 `INVOICE_NOT_PAYABLE` (paid/void/waived), 409 `INVOICE_CHANGED` (concurrent payment).

**Webhook**: `POST /api/v1/webhooks/stripe` (raw body, `Stripe-Signature` HMAC-SHA256, 5-min tolerance). Handles
`checkout.session.completed` with `payment_status=paid`: amount and currency must equal the pending payment (else the payment is
marked `failed`, audited, invoice untouched). Idempotent on the gateway transaction id (unique index). Always 200 after a valid signature.

---

## 5. Seller endpoints — `/seller/billing/*`
`requireAuth + storeContext`; storeId only from `req.store`. View = `store.finance.view`, manage = `store.finance.manage` (OWNER).
Billing-suspended stores pass storeContext (moderation-suspended stores don't).

| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | `/seller/billing/summary` | view | see below. Cheap read: no recompute per request (commission is written on delivery / refund / cancel and by the daily sweep; a safety-net re-sync runs at most once per 10 min per store) |
| GET | `/seller/billing/plans` | view | `{ current, plans: PlanDefinition[], usage: { products, liveProducts, staff, sections }, commissionBps }` |
| POST | `/seller/billing/change-plan` | manage | `{ plan }` → `{ subscription, invoice: InvoiceDTO \| null, effective: 'on_payment' \| 'period_end' \| 'now' }` (201 when an invoice is created; picking the current plan cancels a scheduled change → `now`, else 409 `ALREADY_ON_PLAN`; 409 `PAYMENT_PENDING` while a manual payment for the open upgrade awaits review) |
| POST | `/seller/billing/cancel` | manage | = change-plan to free at period end |
| DELETE | `/seller/billing/scheduled-change` | manage | cancels scheduled downgrade / open upgrade invoice → `{ subscription }` |
| GET | `/seller/billing/invoices` | view | `?status=&kind=&cursor=&limit=` |
| GET | `/seller/billing/invoices/:id` | view | `InvoiceDTO` + `commissions: CommissionEntryDTO[]` (≤ 500) + `payments` |
| GET | `/seller/billing/invoices/:id/pdf` | view | A4 PDF |
| POST | `/seller/billing/invoices/:id/pay` | manage | see §4 |
| GET | `/seller/billing/payment-options` | view | `{ balance: { available }, manualAccounts: ManualAccount[], gateways: { stripe: boolean, jazzcash: false, easypaisa: false } }` |
| GET | `/seller/billing/payments` | view | payment history `?status=&cursor=&limit=` |
| GET | `/seller/billing/commissions` | view | `?status=&channel=&kind=&cursor=&limit=` |
| — | `/seller/finance/payout-requests` | — | payouts (existing, docs/api-growth.md) |

`GET /seller/billing/summary`:
```ts
{
  subscription: SubscriptionDTO;
  plan: PlanDefinition;
  nextInvoiceEstimate: { date: string; plan: StorePlan; fee: number; commission: number; balanceRecovery: number; total: number };
  outstanding: { invoices: number; amountDue: number; overdue: number; nextDueDate: string | null };
  totals: {
    grossSales: number; codSales: number; onlineSales: number;        // order totals of delivered (recognized) orders
    commissionBase: number;
    totalCommission: number;      // net of reversals
    paidCommission: number;       // paid + deducted (online) − credited reversals
    unpaidCodCommission: number;  // unpaid + invoiced (net)
    availableBalance: number; onHold: number; pendingPayouts: number;
  };
  commissionBps: 1500; graceDays: number; currency: 'PKR';
}
```

## 6. Admin endpoints — `/admin/billing/*`
`requireAuth + not impersonating + admin.billing.view|manage` (FINANCE & SUPER_ADMIN: view+manage; ADMIN: view).
Every mutation is audited; every money change also writes a `BillingAdjustment` (never silent deletes).

| Method | Path | Perm | Body / query |
|---|---|---|---|
| GET | `/admin/billing/overview` | view | `{ sellers: { registered, approved, billingSuspended }, subscribers: { free, pro, premium }, mrr, subscriptionRevenue: { thisMonth, allTime }, commission: { total, online, cod, codOutstanding, codPaid, reversed }, invoices: { open, overdue, amountDue }, pendingManualPayments, payoutsPending: { count, amount }, commissionBps }` |
| GET | `/admin/billing/stores` | view | `?q=&plan=&billingStatus=&cursor=&limit=` → rows with subscription + outstanding |
| GET | `/admin/billing/stores/:storeId` | view | `{ store, subscription, totals, invoices (20), payments (20), commissions (20), adjustments (20) }` |
| POST | `/admin/billing/stores/:storeId/plan` | manage | `{ plan, reason }` immediate change (no invoice), adjustment `plan_change` |
| POST | `/admin/billing/stores/:storeId/extend` | manage | `{ days (1..365), reason }` extends current period, adjustment `extension` |
| POST | `/admin/billing/stores/:storeId/suspend` | manage | `{ reason }` billing suspension `reason: 'admin'` |
| POST | `/admin/billing/stores/:storeId/reactivate` | manage | `{ reason }` lifts billing suspension (any reason) |
| GET | `/admin/billing/invoices` | view | `?status=&kind=&storeId=&cursor=&limit=&format=csv` |
| GET | `/admin/billing/invoices/:id` | view | detail (+ store) |
| GET | `/admin/billing/invoices/:id/pdf` | view | A4 PDF (audited) |
| POST | `/admin/billing/invoices/:id/waive` | manage | `{ amount?, reason (5..500) }` (default = amount due) → adjustment `waiver` |
| GET | `/admin/billing/payments` | view | `?status=pending&method=manual&cursor=` (verification queue) |
| POST | `/admin/billing/payments/:id/approve` | manage | `{ amount?, note? }` (amount ≤ due; less = partial) |
| POST | `/admin/billing/payments/:id/reject` | manage | `{ reason }` |
| GET | `/admin/billing/commissions` | view | `?storeId=&status=&channel=&kind=&cursor=` (reversals = refunds list); rows add `storeId`, `storeName`, `storeSlug` |
| GET | `/admin/billing/adjustments` | view | `?storeId=&type=&cursor=`; rows carry `storeName`, `storeSlug` |
| GET | `/admin/billing/report` | view | `?from=&to=&format=json|csv` per-store rows: fees billed/paid, commission (cod/online), reversals, outstanding |
| GET | `/admin/billing/settings` | view | `{ graceDays, manualAccounts: [{ channel, title, accountName, accountNumber, iban?, instructions? }] }` |
| PUT | `/admin/billing/settings` | manage | same shape (graceDays 0..60, ≤ 5 accounts) |
| POST | `/admin/billing/sweep` | manage | runs the daily sweep now → counters |

Payout management stays at `/admin/payouts*` (docs/api-admin.md). CSV exports are formula-injection safe.

## 7. Public
* `GET /config/public` → adds `billing: { commissionBps: 1500, plans: PlanDefinition[] }`.
* `GET /plans` → `{ commissionBps, plans }` (no auth) for the plan page and Become-a-Seller wizard.

## 8. Legacy endpoints
* `GET /seller/plan` still works (adds `billing` subset). `POST /seller/plan/request` + `/admin/plan-requests` are kept as a
  "comp request" path: admin approval changes the plan without an invoice (audited + `plan_change` adjustment). New UI should use
  `/seller/billing/change-plan`.
* `PATCH /admin/stores/:id/plan` routes through the same admin plan change (reason defaults to "Admin plan change").

## 9. Edge cases
* Repeated delivered events / sweeps never duplicate commission (unique `orderId` charge index + `(storeId, ref)` unique).
* An invoice issuance is unique per `(storeId, periodStart)` for renewals; entries move `unpaid → invoiced` with a
  conditional update inside the same transaction (no double billing).
* Pay-from-balance, payout requests and invoice issuance take a per-store lock (Subscription `lockVersion` bump) inside a
  MongoDB transaction so concurrent requests cannot overdraw.
* Store A can never read Store B billing (404 for foreign ids). Sellers get 403 on `/admin/billing/*`.
