# Phase 7 API — notifications, rider, live tracking, returns

Base `/api/v1`. Envelope, cursor pagination and errors as in CLAUDE.md. Money = paisa.

## Notifications (any logged-in user, own rows only)
| Method | Path | Notes |
|---|---|---|
| GET | `/notifications?cursor=&limit=&unread=1` | newest first → `NotificationDTO[]`, `meta.nextCursor` |
| GET | `/notifications/unread-count` | `{ count }` |
| POST | `/notifications/:id/read` | → DTO (404 if not mine) |
| POST | `/notifications/read-all` | `{ updated }` |
| DELETE | `/notifications/:id` | 204 |
| POST | `/push/subscriptions` | `{ endpoint, keys: {p256dh, auth} }` → 201; `{ enabled:false }` meta when no VAPID keys |
| DELETE | `/push/subscriptions` | `{ endpoint }` → 204 |

`NotificationDTO {id, type, title, body, link?, data?, readAt|null, createdAt}`. Socket: `notification:new` (DTO) on `user:{id}`.
Server API: `notify({ userId, type, title, body, link?, data?, channels? })` (`modules/notifications/notification.service.ts`), default channels `['inapp','push']`; email/SMS/push respect `User.notifications` prefs. TTL 180 days.
Types used: `order.placed|confirmed|packed|shipped|out_for_delivery|delivered|failed_delivery|cancelled|return_requested|returned|refunded`, `order.new` (store owner + ORDERS/MANAGER staff), `return.*`, `rider.assigned`.

## Rider (`/rider/*`, requireAuth; caller must be an active member with `store.delivery.perform` of the order's store AND `order.riderId`)
| Method | Path | Notes |
|---|---|---|
| GET | `/rider/me` | `{ stores[{id,name,slug}], stats: {todayDeliveries, codCollectedToday, codOutstanding, earningsToday, earningsTotal} }` |
| GET | `/rider/deliveries?date=today\|upcoming\|history&cursor=` | today = out_for_delivery + delivered/failed today; upcoming = shipped; history = delivered/failed_delivery |
| GET | `/rider/deliveries/:orderId` | `RiderDeliveryDTO` (buyer name/phone, address, location?, codAmount, itemsCount, otpLockedUntil?) — never the OTP |
| POST | `/rider/deliveries/:orderId/start` | shipped/failed_delivery → out_for_delivery; DeliverySession upsert |
| POST | `/rider/deliveries/:orderId/location` | `{lat,lng,accuracy?,heading?,speed?}` only while out_for_delivery; ≥3 s apart (429 `TOO_FAST`) |
| POST | `/rider/uploads` | multipart `file` (image ≤5 MB) → `{key,url,ref}` (proof of delivery; send `ref` back) |
| POST | `/rider/deliveries/:orderId/deliver` | `{otp, codCollected?, photoRef?}`; wrong → 400 `OTP_INVALID` (`details.attemptsLeft`); 5 wrong → 423 `OTP_LOCKED` 15 min |
| POST | `/rider/deliveries/:orderId/fail` | `{reason: customer_unavailable\|wrong_address\|refused\|other, note?}` → failed_delivery |
| GET | `/rider/cod` | per store `{storeId, storeName, collected, settled, outstanding}` + `entries[]` |

Socket (client → server): `rider:location {orderId, lat, lng, ...}` with ack `{ok}|{error}` — same rules as HTTP.
Seller (`/seller/riders`, storeContext): `GET /` (store.orders.view) riders with `{memberId, user{id,name}, activeDeliveries, deliveredTotal, codOutstanding, earnings}`; `POST /:memberId/cod-settle {amount}` (store.orders.manage, ≤ outstanding, audited); `GET/PATCH /settings {riderFee}` (default 12000).

## Live tracking
- `GET /orders/:number/tracking` (buyer, store member, or staff with `admin.orders.view`; others 404) → `{status, active, rider: {name, phone (masked)}|null, lastLocation {lat,lng,at}|null, eta (minutes)|null, destination {city, area?, location?}}`. Rider/location/eta only while `out_for_delivery`.
- Socket `order-track:join {orderId}` (ack `{ok}` or `{error}`) → room `order-track:{orderId}`; allowed only for buyer / store member / admin.orders.view AND status out_for_delivery. Server emits `rider:location {orderId, lat, lng, at, eta}` and `tracking:ended {orderId, status}` (room is emptied).
- `RiderLocation` TTL 7 days. ETA = haversine / 25 km/h.

## Returns
Buyer: `POST /returns/uploads` (multipart image) → `{key,url,ref}`; `POST /orders/:number/returns {items[{variantId,qty,reason?}], reason, description?, photos?: ref[] ≤5}` (delivered, within min(product.returnPolicy.days ?? 7)); `GET /returns`, `GET /returns/:id`, `POST /returns/:id/escalate {message}` (requested/rejected → escalated + Dispute).
Seller (`/seller/returns`): `GET /?status=&cursor=` (orders.view), `POST /:id/approve|reject {note?}` (reject needs note), `/received` (restock, reason `return`), `/refund` (wallet credit, once). orders.manage.
Order: delivered → return_requested (create) → delivered (reject) / returned (received) → refunded.
Refund amount = min(Σ price×qty of returned items, order.total).
