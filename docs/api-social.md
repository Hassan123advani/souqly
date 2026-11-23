# Social, engagement & loyalty API (Phase 8)

Base `/api/v1`. Auth = `sq_at` cookie. Lists: `?cursor=&limit=` → `meta.nextCursor`. Money in paisa.
Schemas: `shared/src/schemas/social.ts`; DTOs: `shared/src/types/social.ts`.

## Media uploads
- `POST /social/uploads` (auth, multipart `file`, field `kind` = `review_image|review_video|chat_image`) → `{ url, key, mimetype, size }`.
  Images ≤ 5 MB (jpg/png/webp/avif), video ≤ 30 MB (mp4/webm). Keys are scoped to `social/<userId>/<kind>/`; other users' keys are rejected.

## Reviews
- `GET /products/:slug/reviews?sort=recent|helpful|rating_high|rating_low&withMedia=1&rating=1..5&cursor=` (public; `meta.nextCursor`). `myVote` when logged in.
- `GET /products/:slug/reviews/summary` → `{ avg, count, breakdown: {1..5}, withMedia }`.
- `POST /reviews` `{ orderId, productId, variantId, rating, title?, body?, media?: [{ key, type }] }` → 201. Only the buyer of a **delivered** order containing that item; one review per order item (409 `ALREADY_REVIEWED`). Bad words → masked + `status: pending` (moderation).
- `GET /reviews/mine`, `GET /reviews/pending` (delivered items not yet reviewed).
- `POST /reviews/:id/helpful` (toggle off with `DELETE`), once per user, not on own review.
- `POST /reviews/:id/report` `{ reason, details? }` → Report.
- Seller: `GET /seller/reviews?rating=&replied=0|1&cursor=` (STORE_ORDERS_VIEW or STORE_CHAT_MANAGE), `POST /seller/reviews/:id/reply` `{ text }`.

## Q&A
- `GET /products/:slug/questions?cursor=` (public, published only), `POST /products/:slug/questions` `{ text }` (auth).
- Seller: `GET /seller/questions?unanswered=1&cursor=`, `POST /seller/questions/:id/answer` `{ text }` (STORE_CHAT_MANAGE). Asker is notified.

## Follows
- `POST|DELETE /stores/:slug/follow`, `GET /stores/:slug/follow-status` → `{ following, followerCount }`.
- `GET /me/following?cursor=`, `GET /feed/following?cursor=` (newest published products of followed stores).

## Wishlists
- `GET /wishlists`, `POST /wishlists {name}`, `PATCH /wishlists/:id {name}`, `DELETE /wishlists/:id` (not the default).
- `GET /wishlists/:id` (items with product cards), `POST /wishlists/:id/items {productId, variantId?}`, `DELETE /wishlists/:id/items/:productId?variantId=`.
- `POST /wishlists/items {productId, variantId?}` (default list), `DELETE /wishlists/items/:productId` (from all lists).
- `GET /wishlists/contains?productIds=a,b,c` → `{ [productId]: boolean }`.

## Alerts
- `GET /alerts`, `POST /alerts {productId, variantId?, type: price_drop|back_in_stock}`, `DELETE /alerts {productId, variantId?, type}`.

## Chat
- Buyer: `GET /chat/conversations`, `POST /chat/conversations {storeSlug, productId?}`, `GET /chat/conversations/:id/messages?cursor=`, `POST /chat/conversations/:id/messages`, `POST /chat/conversations/:id/read`.
- Seller (STORE_CHAT_MANAGE): `GET /seller/chat/conversations`, `GET /seller/chat/quick-replies`, same `/seller/chat/conversations/:id/...` endpoints.
- Message body: `{type:'text',text}` | `{type:'image',imageKey}` | `{type:'product',productId}` | `{type:'order',orderId}` (order must belong to this buyer + store).
- Socket: emit `chat:join {conversationId}` (ack `{ok}`), `chat:leave`, `chat:typing {conversationId, typing}`. Server emits `chat:message`, `chat:typing`, `chat:read` to room `conv:{id}`; `chat:conversation {id, unread}` to `user:{buyerId}` / `store:{storeId}` (no message text).

## Wallet & coins
- `GET /wallet` → `{ balance }`, `GET /wallet/transactions?cursor=`.
- `GET /coins` → `{ balance, history, worth }`, `GET /coins/check-in` (status), `POST /coins/check-in` (flag `dailyCheckIn`).
- Earn 1 coin per Rs. 100 of a delivered order (flag `loyaltyCoins`). Redeem: `coins` in checkout preview/place body; 100 coins = Rs. 10; max 20% of the order total.

## Referrals & gift cards
- `GET /referrals` → `{ code, shareUrl, invited, rewarded, earned }`. Referee's first delivered order: referrer Rs. 200 wallet, referee 500 coins.
- `POST /gift-cards/redeem {code}` → wallet credit. Admin: `POST /admin/gift-cards {amount, code?, expiresAt?}`, `GET /admin/gift-cards` (ADMIN_FINANCE_MANAGE / VIEW).

## Reports
- `POST /reports {targetType: product|store|review|message, targetId, reason, details?}` → 201 (one per reporter + target).
