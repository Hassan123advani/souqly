# Super Admin API (Phase 9)

Base: `/api/v1/admin` (except buyer support + public CMS pages). Every route: `requireAuth` + `requirePermission(ADMIN_*)`.
Every mutation writes an `AuditLog` (`admin.*` actions). Lists: `?cursor=&limit=` → `meta.nextCursor`.
List endpoints marked **CSV** also accept `?format=csv` (streams `text/csv`; cells starting with `= + - @` (and tab/CR) are prefixed with `'`).
Money = integer paisa. Rates = basis points.

| Area | Endpoint | Permission |
|---|---|---|
| Dashboard | `GET /dashboard?from&to` → totals (gmv, commission, orders, users, newSignups, stores by status), `series[]` by day, `top.{stores,products,categories}`, `pending.{stores,products,returns,disputes,reports,tickets,payouts,mallRequests}` | DASHBOARD |
| Users | `GET /users?q&role&status&seller` **CSV** · `GET /users/:id` (orders, stores, sessions, wallet, coins) | USERS_VIEW |
| | `POST /users/:id/block {reason}` (revokes sessions) · `POST /users/:id/unblock` · `POST /users/:id/logout` | USERS_MANAGE |
| | `PATCH /users/:id/role {platformRole\|null}` (SUPER_ADMIN only; last SUPER_ADMIN protected) | STAFF_MANAGE |
| | `POST /users/:id/impersonate {reason}` → session flagged `impersonatorId` (not staff/admins) | USERS_IMPERSONATE |
| | `POST /impersonation/stop` (any impersonated session) → fresh admin session | auth only |
| | `POST /users/:id/wallet-adjust {amount(+/-), reason}` | FINANCE_MANAGE |
| Stores | `GET /stores?status&mall&plan&q` **CSV** · `GET /stores/:id` · `GET /stores/:id/business` (masked, audited) · `GET /mall-requests` | STORES_VIEW |
| | `POST /stores/:id/approve\|reject` · `POST /stores/:id/suspend {reason}` · `POST /stores/:id/unsuspend` · `PATCH /stores/:id/mall {isMall}` · `PATCH /stores/:id/plan {plan}` · `PUT /stores/:id/commission {bps\|null}` | STORES_MANAGE |
| Products | `GET /products?status=pending_review&q&storeId` **CSV** · `POST /products/:id/approve` · `POST /products/:id/reject {note}` · `POST /products/bulk {ids, action, note?}` · `PATCH /products/:id/feature {isFeatured}` · `POST /products/:id/hide {note}` | PRODUCTS_MODERATE |
| Catalog | `GET /categories` · `POST /categories` · `PATCH /categories/:id` · `POST /categories/:id/move {parentId, order}` (recomputes ancestors + products' categoryPath in a job) · `POST /categories/reorder {parentId, ids[]}` · `PUT /categories/:id/attributes` · `DELETE /categories/:id` (empty only) · brands `GET/POST /brands`, `PATCH/DELETE /brands/:id` | CATALOG_MANAGE |
| Orders | `GET /orders?status&storeId&q&from&to` **CSV** · `GET /orders/:id` | ORDERS_VIEW |
| | `POST /orders/:id/status {status, reason}` (override, audited) · `POST /orders/:id/refund {amount, reason}` (wallet) | ORDERS_MANAGE |
| Returns/disputes | `GET /returns?status` · `GET /disputes?status` · `GET /disputes/:id` · `POST /disputes/:id/messages {text}` · `POST /disputes/:id/resolve {outcome: refund_buyer\|side_with_seller, note}` | DISPUTES_MANAGE |
| Marketing | `/campaigns`, `/flash-sales`, `/vouchers` (platform) CRUD | MARKETING_MANAGE |
| CMS | `GET/PUT /cms/home` (heroSlides, sections, featured) · `POST /cms/uploads` (image) · `/pages` CRUD · public `GET /api/v1/pages/:slug` | CMS_MANAGE |
| Commission | `/commission-rules` read-only since billing (create/update/delete and `PUT /stores/:id/commission` → 409 `COMMISSION_FIXED`; flat 15%, docs/api-billing.md) | FINANCE_VIEW |
| Billing | `/billing/*` subscriptions, invoices, manual payment verification, waivers, report, settings (docs/api-billing.md §6) | BILLING_VIEW / BILLING_MANAGE |
| Finance | `GET /payouts?status&storeId` **CSV** · `POST /payouts/:id/approve\|mark-paid {reference}\|reject {notes}` · `GET /finance/report?from&to&groupBy=day\|month` (+`format=csv`) | FINANCE_VIEW / FINANCE_MANAGE |
| Moderation | `GET /reviews?status` **CSV** · `POST /reviews/:id/hide\|restore` · `DELETE /reviews/:id` · `GET /reports?status` · `POST /reports/:id/resolve {action: dismiss\|hide_target\|resolved, note}` · `GET /fraud-signals` · `POST /fraud-signals/:id/dismiss` | REVIEWS_MODERATE |
| Support | buyer: `POST/GET /api/v1/support/tickets`, `GET /support/tickets/:id`, `POST /support/tickets/:id/messages` · admin: `GET /tickets?status&assigneeId` · `GET /tickets/:id` · `POST /tickets/:id/assign {assigneeId}` · `POST /tickets/:id/reply {body}` · `PATCH /tickets/:id/status` | SUPPORT_MANAGE |
| Email templates | `GET /email-templates` · `PUT /email-templates/:key {subject, html}` · `DELETE /email-templates/:key` · `POST /email-templates/:key/preview` · `POST /email-templates/:key/test {to}` | SETTINGS_MANAGE |
| Settings | `GET/PUT /settings/{site,feature-flags,payment-methods,shipping-zones,tax}` | SETTINGS_MANAGE |
| Staff | `GET /staff` · `POST /staff {email, platformRole}` (existing user) · `DELETE /staff/:id` | STAFF_MANAGE |
| Audit | `GET /audit-logs?actorId&action&targetType&targetId&from&to` **CSV** | AUDIT_VIEW |
| System | `GET /system/health` (uptime, memory, db + collection counts, integrations, jobs, last 50 errors) | SYSTEM_VIEW |

Maintenance mode (`settings.site.maintenance`): non-staff requests get `503 MAINTENANCE` except `/auth/*`, `/config/public`, `/health`, `/pages/*`.
Impersonated sessions: 1 h max, `forbidWhileImpersonating` on credential/security routes, cannot reach `/admin/*` (impersonated user is never staff).
