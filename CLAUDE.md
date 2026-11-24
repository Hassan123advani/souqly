# Souqly (سوقلي) — Project Rules

"Every shop, one souq." A multi-vendor marketplace. Each user is a buyer by default and can switch to seller mode to run a store.

**Read this file, PROGRESS.md and DECISIONS.md before doing anything.** If the user says "continue", resume from PROGRESS.md "Next".

## Communication
- Talk to Hassan (the owner) in simple Roman Urdu.
- All code, comments, commit messages and docs are in English.

## Safety
- Never delete anything outside this folder. Never commit `.env` / `*.local` files or secrets, never sign up for or pay for services.
- Push/deploy: the owner authorized (2026-11-24) pushing to GitHub `Hassan123advani/souqly` (private, remote `origin`) and deploying to Vercel (team `hassan-advani`, project `souqly`). See docs/deploy-vercel.md. Production secrets live only in `server/.env.production.local` (gitignored) and the Vercel dashboard.
- `souqly/` is its own local git repo (the parent home folder is also a git repo; never commit there).

## Stack
- **client/**: React 18 + Vite + TypeScript, React Router 6, TanStack Query 5, Zustand, Tailwind CSS 3 + own UI kit (`src/components/ui`, Radix primitives allowed), Framer Motion, React Hook Form + Zod, i18next (en/ur/ar), Recharts, socket.io-client, Leaflet + OpenStreetMap (Google Maps when key exists), vite-plugin-pwa, react-helmet-async.
- **server/**: Node 20+ Express 4 + TypeScript (run with `tsx`, built with `tsup`), Mongoose 8, Zod, JWT (access + refresh in httpOnly cookies), bcryptjs, Socket.io, Multer, pino, helmet, express-rate-limit, cors.
- **shared/** (`@souqly/shared`): TS source consumed directly by client (Vite) and server (tsx / tsup bundles it). Roles, permissions, statuses, money utils, Zod schemas. **Never duplicate these in client or server.**
- **e2e/**: Playwright.
- Tests: vitest (+ supertest + mongodb-memory-server) for shared and server.

## Ports & URLs (dev)
- Client: http://localhost:5173 (Vite proxies `/api`, `/uploads`, `/socket.io`, `/sitemap.xml`, `/robots.txt` to the server)
- Server: http://localhost:4000 (API under `/api/v1`)

## Folder conventions
```
server/src/
  config/env.ts          # Zod-validated env; exposes feature availability (hasCloudinary, hasSmtp...)
  config/db.ts           # Mongo connect; falls back to mongodb-memory-server in development
  lib/                   # logger, AppError, asyncHandler, cursor pagination, sanitize, tokens
  middleware/            # auth (requireAuth, optionalAuth), permissions (requirePermission, requireAdmin), storeContext, validate, rateLimit, error
  services/              # storage/, email/, notify/, payment/, jobs/ — interface + implementations + factory
  modules/<name>/        # <name>.model.ts, <name>.service.ts, <name>.routes.ts, <name>.test.ts
  socket/                # socket.io setup + namespaces/rooms
  seed/                  # seed.ts, clear.ts, data/
  app.ts                 # express app (no listen) — imported by tests
  index.ts               # starts http + socket server
client/src/
  api/                   # axios client + TanStack Query hooks per domain
  components/ui/         # design-system primitives (Button, Input, Card, Badge, Skeleton, Modal, Sheet, Tabs, Toast...)
  components/<area>/     # layout, product, store, cart ...
  pages/<area>/          # buyer, account, seller, admin, rider, auth, static
  stores/                # zustand stores
  i18n/                  # i18next setup + locales/en|ur|ar.json
  styles/                # tokens.css, globals.css
  lib/                   # format, utils, socket
```

## API conventions
- Base `/api/v1`. JSON responses: success → `{ data, meta? }`; error → `{ error: { code, message, details? } }`.
- Validate **every** body / query / params with Zod via `validate({ body, query, params })`.
- Lists use cursor pagination: query `?cursor=&limit=`, response `meta: { nextCursor }`.
- Throw `AppError(status, code, message)`; never leak stack traces. Wrap handlers with `asyncHandler`.
- Money is integer **minor units** (paisa). Use helpers from `@souqly/shared` (`formatMoney`, `applyBps`). Rates in basis points.
- Mass assignment is forbidden: build update objects from whitelisted fields only.

## Auth
- Access token (15 min) cookie `sq_at`, refresh token (30 days) cookie `sq_rt` — httpOnly, SameSite=Lax, Secure in production.
- Refresh tokens are stored hashed in the `Session` collection (rotation on every refresh; reuse → revoke all sessions of that user).
- `req.user` = `{ id, platformRole?, permissions[] , sessionId, impersonatorId? }`.

## Tenant isolation (CRITICAL)
- Every store-owned document has `storeId` (indexed, first in compound indexes).
- Seller Center routes are mounted under `/api/v1/seller/*` behind `requireAuth` + `storeContext`. `storeContext` loads the user's `StoreMember` record for the store they are acting on (header `x-store-id` only *selects* among stores the user is a member of; it is verified against membership) and sets `req.store` + `req.storePermissions`.
- **Queries in seller routes always filter by `req.store._id`. Never read storeId from body/query/params.**
- Tests in `server/src/modules/**/tenant.test.ts` must prove Store A cannot read/edit Store B data.

## Dev fallbacks (must work with NO keys)
| Service | Real (when env present) | Fallback |
|---|---|---|
| MongoDB | `MONGODB_URI` | mongodb-memory-server (dev only; data resets on restart; auto-seeds) |
| Storage | Cloudinary (`CLOUDINARY_*`) | local disk `server/uploads`, served at `/uploads` |
| Email | SMTP (`SMTP_*`) | console log |
| SMS/WhatsApp | Twilio (`TWILIO_*`) | console log |
| Maps | Google Maps (`VITE_GOOGLE_MAPS_KEY`) | Leaflet + OSM |
| Payments | JazzCash / EasyPaisa / Stripe keys | COD only; others show "coming soon" |
| Jobs | Redis (`REDIS_URL`) | in-process scheduler |
| Google login | `GOOGLE_CLIENT_ID/SECRET` | button hidden |
The server exposes `GET /api/v1/config/public` with which integrations/flags are enabled; the client reads it.

## Design system — "Souq Dusk"
- Concept: warm souq lanterns at dusk. Original look; never copy Daraz or any other brand.
- Colors (CSS vars in `client/src/styles/tokens.css`, Tailwind maps to them):
  - `primary` = Deep Teal `#0E5E5A` (trust) — scale 50..950
  - `accent` = Saffron `#F2A93B` (warmth, CTAs on dark, highlights)
  - `sale` = Pomegranate `#D6453D` (discounts, flash sale)
  - `ink` neutrals warm-gray; light background `#FBF8F3` (parchment), dark background `#0F1716`
  - success `#1F8A5B`, warning `#C98A12`, danger `#C2362F`, info `#2F6FB0`
- Typography: Latin **Plus Jakarta Sans**; Arabic **Readex Pro**; Urdu **Noto Nastaliq Urdu** (line-height 2). Loaded from Google Fonts.
- Radius: sm 6, md 10, lg 16, xl 24, pill 999. Shadows: soft layered (`shadow-card`, `shadow-pop`). Motion: 150/250/400ms, ease `cubic-bezier(.2,.8,.2,1)`; respect `prefers-reduced-motion`.
- Dark mode: `class` strategy on `<html>`. RTL: `dir` on `<html>`; use logical utilities (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`), never `ml-/mr-/left-/right-` for direction-dependent spacing.
- Every data view: skeleton, empty state, error state (with retry). Toasts for mutations. Focus-visible rings. WCAG AA.
- Mobile: bottom nav (Home, Categories, Cart, Chat, Account). Seller Center & Admin: collapsible sidebars.

## i18n
- All UI strings via `t('namespace.key')`; keys exist in `en.json`, `ur.json`, `ar.json`. English is the fallback.

## Feature flags
- Defaults in `shared/src/constants/flags.ts`; overrides in the `Setting` document (`key: 'featureFlags'`). Unfinished features stay hidden behind a flag.

## Commands
- `npm install` (root) · `npm run dev` · `npm run seed` · `npm run seed:clear` · `npm test` · `npm run test:e2e` · `npm run typecheck` · `npm run build`

## Definition of done for a phase
1. typecheck + tests green. 2. qa-tester, security-reviewer, code-reviewer reviewed; findings fixed. 3. PROGRESS.md updated. 4. Local commit.
