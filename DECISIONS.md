# Decisions Log

Format: **D-number — title** · context → decision → consequences.

**D-001 — Monorepo with npm workspaces** · Need shared types between client and server without publishing packages. → `shared/` is consumed as TypeScript source (`main: src/index.ts`). Vite compiles it for the client; `tsx` runs it in dev and `tsup` bundles it into the server build. → No build step for shared; one `npm install` at root.

**D-002 — Separate local git repo** · The user's home folder is already a git repo containing this project. → `souqly/` has its own `git init`. → Commits never touch the parent repo. Nothing is pushed.

**D-003 — Money in integer minor units, rates in basis points** · Floating point errors in prices, commission and voucher math. → All amounts stored as integers (paisa). Percentages as bps (1250 = 12.5%). → Display via `formatMoney()`.

**D-004 — JWT in httpOnly cookies with server-side sessions** · Need "log out all devices", sessions list and refresh-token theft detection. → Short access JWT (15 min) + opaque refresh token stored hashed in `Session` collection, rotated on each refresh; reuse of an old refresh token revokes all of the user's sessions. → Sessions page and admin "force logout" are simple DB updates.

**D-005 — Tenant isolation via StoreMember + storeContext middleware** · Multi-vendor data must never leak across stores. → Membership table `StoreMember {storeId, userId, role, customRoleId, permissions}`; seller routes get `req.store` only from membership. `x-store-id` header selects among the user's own stores. → One user may belong to several stores (owner of one, staff in another).

**D-006 — Dev fallbacks behind interfaces** · Must run with zero API keys. → `StorageService`, `EmailService`, `NotificationProvider`, `PaymentProvider`, `JobQueue`, each with a factory choosing the real implementation if env keys exist. In-memory MongoDB in development when `MONGODB_URI` is missing, auto-seeded on boot so the site is immediately usable. → Switching to real services is only an `.env` change.

**D-007 — Brand "Souq Dusk" design system** · Needs to feel premium, warm and trustworthy and distinct from Daraz (orange) and Amazon. → Deep teal primary + saffron accent + pomegranate for sales on a parchment background; lantern-arch motif in the logo. Plus Jakarta Sans / Readex Pro / Noto Nastaliq Urdu. → See CLAUDE.md "Design system".

**D-008 — Search without external engine** · No Algolia/Elastic keys. → MongoDB text index + a lightweight fuzzy layer (normalized trigram-ish regex on name/brand/tags, and Levenshtein-based "did you mean" against a vocabulary of product names, categories and stores). → Can swap to Atlas Search later behind `SearchService`.

**D-009 — Order split** · One checkout must create one order per store. → `Checkout` (parent, payment) → `Order` per store (sub-order, own status/timeline/shipping). Stock is decremented atomically with `findOneAndUpdate({stock: {$gte: qty}})` per variant; on any failure the already-decremented items are restored. → Works without replica-set transactions (memory server is standalone).

**D-010 — Images for demo data** · No copyrighted images allowed. → Seed generates original SVG placeholder product art (category-themed gradients + iconography + product name) stored via StorageService. → Fully offline, no licensing risk.

**D-011 — Refresh rotation: one Session doc per rotation** · Need reuse detection without false alarms from two tabs refreshing at once. → Refresh token = `<sessionId>.<random>`, only sha256 stored. Each refresh atomically revokes the old Session (`replacedBy` = new id) and creates a new one (keeps the original `createdAt`). Presenting a rotated token more than 15 s after rotation revokes ALL the user's sessions + audit `auth.refresh_token_reuse`; inside 15 s it returns 401 `SESSION_ROTATED` without clearing cookies. Rotated docs are TTL-deleted after 7 days (reuse detection window). An access token whose session was rotated returns `TOKEN_EXPIRED` so the client simply refreshes. → Sessions list only shows non-revoked docs.

**D-012 — Jobs are in-process only for now** · Redis/BullMQ are not installed. → `JobQueue` interface (`register`, `schedule`, `every`, `stop`) with an in-process setTimeout/setInterval implementation; no persisted Job collection. Scheduled jobs are lost on restart, so handlers must be idempotent and periodic sweeps must re-derive pending work from the DB. → A Redis implementation can be added behind the same interface when `REDIS_URL` is set.

**D-013 — Server test setup** · Fast, isolated, key-free tests. → vitest globalSetup starts ONE mongodb-memory-server; each test file uses its own random database. `NODE_ENV=test` never reads `server/.env` (so real SMTP/Twilio keys are never used by tests), rate limiters are skipped (`TEST_RATE_LIMIT=1` re-enables), bcrypt cost is 4 in tests (12 otherwise). Emails/SMS are captured in `consoleOutbox` / `notifyOutbox` from the console fallbacks.

**D-014 — Account schemas and API types live in @souqly/shared** · Client forms and server validation must agree. → Added `shared/src/schemas/account.ts` (profile, preferences, 2FA, mode, sessions, delete, verify-email) and `shared/src/types/api.ts` (`MeUser`, `Address`, `SessionInfo`, `PublicConfig`, `ApiError`).

**D-015 — Phone OTP details** · → Phones normalized to `+E.164`. If the account has 2FA, `/auth/otp/verify` also requires `totp` (401 `TOTP_REQUIRED`; the OTP stays valid for the retry). In production without Twilio, `/auth/otp/request` returns 503 `SMS_UNAVAILABLE` instead of pretending to send.

**D-016 — Change email is immediate + re-verify** · Per docs/api-auth.md. → Email is updated at once with `emailVerified=false` and a verification link goes to the new address (password required; audited with old/new address). No confirmation is sent to the old address yet (possible hardening later).

**D-017 — Local uploads are served inert** · Seed art is SVG (D-010) and users upload images. → `/uploads` responses carry `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox` and `Cross-Origin-Resource-Policy: cross-origin`; avatar uploads are checked by magic bytes (jpg/png/webp, ≤ 2 MB).
