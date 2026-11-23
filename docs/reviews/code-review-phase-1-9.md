# Code review — Phases 1–9

Status: OPEN. Each finding was traced through the full code path by the code-reviewer agent.

## HIGH
- **H1 Partial returns over-refund** — `returns/return.service.ts:81, 222-226, 241`; `admin/disputes.routes.ts:157`. Refund uses pre-discount `line.price*qty` AND refunds coins → buyer gains money. Fix: refund the net actually paid: `net = subtotal - promo - store - platform - coins`; `refund = floor(net * returnedValue / subtotal)`; shipping + remainder only on full return; coins refunded separately/proportionally; store formula inputs on ReturnRequest.
- **H2 Voucher perUserLimit bypass via parallel checkouts** — `voucher.service.ts:45-48`, `checkout.service.ts:190-193, 320-324`. Fix: atomically claim per-user usage in step 1 (insert VoucherUsage then recount + rollback, or conditional per-user counter); release in `fail()`.
- **H3 Flash-sale quantityLimit not enforced** — `cart/quote.ts:44-56`, `checkout.service.ts:326-332`. Fix: conditional `$inc` claim of flash units after stock reservation (match productId + variantId + `sold <= limit - qty`), release in `fail()`; quote prices only remaining units at flash price; carry sale/item ids on quote lines.

## MEDIUM
- **M1 Crash mid-checkout leaks stock/coins/voucher uses; key stuck in `processing`** — `checkout.service.ts:143-293`. Fix: record progress on Checkout; sweeper job for stale `processing` (> 2 min): roll back if no orders, complete if orders exist; final save failure must not turn success into 500.
- **M2 Client drops idempotency key on 409 in-progress / 5xx** — `client/src/pages/checkout/CheckoutPage.tsx:57`. Fix: keep key on CHECKOUT_IN_PROGRESS and 5xx; clear only on 2xx or definite business errors.
  - FIXED (client): `CheckoutPage` keeps the idempotency key when the outcome is unknown (no response, 5xx, 408, 429, `CHECKOUT_IN_PROGRESS`); cleared only on 2xx or other definite 4xx business errors.
- **M3 Delivery rewards not clawed back on return/refund** — `loyalty/rewards.service.ts:19-53`. Fix: proportional coin clawback on refunded (ref `order-clawback:<id>`, floor at 0); referral credit after return window closes or reversed on refund of that first order.
- **M4 Logout leaves previous user's cached data** — `client/src/api/auth.ts:48-57`, `AccountMenu.tsx:114-118`. Fix: `queryClient.clear()` on logout and before setMe on login/signup/OTP/google-2FA success.
  - FIXED (client): `api/auth.ts` `resetSession()` runs on every sign-in (password, signup, OTP, Google 2FA) and sign-out (logout, revoke-all incl. current, delete account): removes inactive queries, resets active ones, sets `me` in place (same effect as `queryClient.clear()` without detaching mounted `useMe()` observers), resets the seller active-store choice (`stores/activeStore.ts`); sign-out also clears recently-viewed / recent-searches localStorage and disconnects the socket.
- **M5 Removed/suspended staff keep receiving store socket events** — `socket/index.ts:57-64`, `staff/staff.service.ts:114-139`. Fix: on member change, disconnect that user's sockets (reconnect with fresh memberships).
- **M6 Delivery OTP lockout bypass via concurrency** — `delivery/rider.service.ts:196-215`. Fix: atomic attempt reservation before verify; don't reset counter on lock; per-order rate limit on deliver.
- **M7 Client socket never recovers after TOKEN_EXPIRED handshake rejection** — `client/src/lib/socket.ts:13-25`. Fix: on `connect_error` TOKEN_EXPIRED/UNAUTHENTICATED → refresh (reuse single-flight refresh) then `socket.connect()`; reconnect on `io server disconnect` if signed in.
  - FIXED (client): `lib/socket.ts` handles `connect_error` TOKEN_EXPIRED/UNAUTHENTICATED via the exported single-flight `refreshOnce()` then `socket.connect()` (exponential backoff, max 5 tries); reconnects on `io server disconnect` while signed in; disconnects on sign-out and re-handshakes on sign-in.

## LOW
- **L1** Online sales don't update `warehouseStock` (`orders/stock.ts:45-59`); `putBack` bumps totalStock for deactivated variants. Fix: default warehouse for online sales or recompute + document.
- **L2** Admin refund cap ignores return refunds; unpaid cancelled COD can be "refunded" (`admin/orders.routes.ts:137-146`).
- **L3** Rejecting a return re-sends "Delivered" notifications (`return.service.ts:201`). Fix: silent/revert option.
- **L4** OrderAlerts toasts other stores' orders and links under the wrong store (`OrderAlerts.tsx:34-46`). Fix: storeId in payload; filter or switch store.
  - FIXED (client): `OrderAlerts` reads `payload.storeId ?? payload.order?.storeId`, ignores stores the user is not a member of, invalidates that store's keys, and the toast action switches the active store before navigating when needed.
- **L5** Store-wide socket events ignore member permissions (`chat.service.ts:153`, `checkout.service.ts:353`). Fix: permission-specific rooms.
- **L6** Guest cart items added during merge get orphaned (`CartSync.tsx:33-52`); failed merge never retried.
  - FIXED (client): adds during the guest-cart merge are queued (`beginMerge`/`endMerge` in `stores/cart.ts`) and flushed through the server add afterwards; a failed merge is retried once on the next window focus (`CartSync.tsx`).
- **L7** Cancel doesn't release voucher usage (`order.service.ts:149-153`). Fix: release when the whole checkout is cancelled.

## Dead code / duplication
1. `order.service.ts:194` `totalFormatted` unused.
2. `checkout.service.ts:305-307, 318, 343` unused `cart`/`stockLines` params.
3. `oid()` helper redefined in 23 files → export once from `server/src/lib`.
4. HTML escaping duplicated (`onboarding.service.ts:82` and `email/templates.ts:7`) → one helper in `lib/sanitize.ts`.
5. `variants.reserved` read everywhere but never written → remove or implement.

## Verified correct
Checkout rollback order, prorate sums + coins split, platform voucher can't go negative, wallet/coins ledgers, cancel stock-restore claim, return restock claim, payout + COD settlement CAS, seller status targets, dispute resolve claim, gift-card claim, client refresh single-flight, route guards + safeNext, useLiveLocation/useLiveRoom/chat listener cleanup.
