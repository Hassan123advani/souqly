# Deploying Souqly to Vercel (one project)

Decision and tradeoffs: DECISIONS.md **D-077**. This page is the how-to.

One Vercel project serves everything from the repo root:

| Piece | How |
|---|---|
| Web client | Vite build → `client/dist` (static, `outputDirectory`) |
| API | `api/index.mjs` → `server/dist-vercel/vercel.js` (Express app as one Node serverless function) |
| Routing | `vercel.json` rewrites `/api/*`, `/uploads/*`, `/sitemap.xml`, `/robots.txt` → the function; every other path that is not a real static file → `/index.html` (SPA). `/assets/*` is never rewritten, so a missing chunk is a real 404. |
| Scheduled jobs | Vercel Cron, daily 22:00 UTC (03:00 PKT) → `GET /api/v1/internal/cron/all` |
| Realtime | Not available. `/api/v1/config/public` returns `integrations.realtime: false`; the client polls. |

Local development is unchanged: `npm run dev` runs `server/src/index.ts` with Socket.io and the in-process timers. Nothing in `api/` or `vercel.json` is used locally.

## Build (what Vercel runs)

- Install: `MONGOMS_DISABLE_POSTINSTALL=1 npm ci --include=dev` (root, npm workspaces). `--include=dev` keeps tsup/vite/typescript even when `NODE_ENV=production` is set for the build. `MONGOMS_DISABLE_POSTINSTALL=1` stops `mongodb-memory-server` from downloading a mongod binary (it is a dev-only fallback; on Vercel it is never started). It is set both in the install command and in `vercel.json` `build.env`; you may also add it in the dashboard.
- Build: `npm run build:vercel` = `npm run build -w client` then `npm run build:vercel -w server` (tsup, ESM, node20; `@souqly/shared` is bundled via `server/tsup.config.ts`, all other dependencies stay in `node_modules` and are traced by Vercel).
- Function config (`vercel.json` → `functions["api/index.mjs"]`): `maxDuration: 60`; `includeFiles` adds `node_modules/pdfkit/js/data/**` (PDFKit core-font AFM files + ICC profile, read with `fs` at runtime for invoices/labels/statements) and `server/package.json` (`"type": "module"` for the `.js` bundle). Memory is left at the plan default (Hobby cannot change it; on Pro set it in Project Settings → Functions if needed).

Try it locally without Vercel: `npm run build:vercel`, then import `api/index.mjs` and pass its default export to `http.createServer` with the production env vars below (that is how it was verified).

## Environment variables (Vercel dashboard → Project → Settings → Environment Variables)

Set them for **Production** (and Preview if you use preview deployments; preferably with a separate database).

| Variable | Value / note |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | Atlas **`mongodb+srv://…`** URI (works on Vercel). Required; the in-memory fallback is refused on serverless. In Atlas → Network Access allow `0.0.0.0/0` (Vercel has no fixed egress IPs on Hobby). |
| `JWT_ACCESS_SECRET` | random, ≥ 32 chars (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`) |
| `JWT_REFRESH_SECRET` | random, ≥ 32 chars, different from the above |
| `DATA_ENCRYPTION_KEY` | random, ≥ 32 chars. **Never change it** after launch (2FA secrets, delivery OTPs and upload refs are encrypted with it). |
| `CLIENT_URL` | `https://<your-project>.vercel.app` (or your custom domain) |
| `SERVER_URL` | the **same** origin as `CLIENT_URL` (API lives at `/api/v1` on the same domain). Google OAuth redirect URI = `SERVER_URL/api/v1/auth/google/callback`. |
| `TRUST_PROXY` | `1` — Vercel's edge is the single proxy in front and sets `X-Forwarded-For` to the real client IP; needed for per-IP rate limits and session IPs. Never `true`. |
| `COOKIE_SECURE` | leave empty (defaults to `true` in production). Cookies are first-party (same origin), SameSite=Lax. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Needed for **any** upload. Without them every upload answers `503 STORAGE_NOT_CONFIGURED` (the function disk is read-only; local storage is disabled on serverless). |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | web push (optional; `npx web-push generate-vapid-keys`). Push is the main "live" channel without sockets. |
| `CRON_SECRET` | random, ≥ 16 chars. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically. Unset = the cron endpoint is 404 and sweeps never run. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Required by env validation in production: the password must be strong (12+ chars, not the default / deny-listed) or the function refuses to start. Only the seed uses them to create the Super Admin. |
| `MONGOMS_DISABLE_POSTINSTALL` | `1` (already in `vercel.json`; harmless to repeat in the dashboard) |
| Optional | `SMTP_*`, `TWILIO_*`, `GOOGLE_CLIENT_ID/SECRET`, payment keys, `OPENAI_API_KEY`, `CORS_EXTRA_ORIGINS`, `LOG_LEVEL` — same meaning as in `server/.env.example`. |

Do **not** set `SERVERLESS` (it defaults to on because Vercel sets `VERCEL=1`, and the function entry forces it anyway) or `DEV_OTP_ECHO` (refused in production). Client build vars (`VITE_*`, see `client/.env.example`) are read at build time; leave `VITE_API_URL` empty (same origin).

## Seeding the Atlas database (from your own machine)

The function never seeds. Run the seed locally against Atlas once:

1. Use the **non-SRV** connection string locally. SRV DNS lookups (`mongodb+srv://`) time out on this machine's network, so take the standard form from Atlas (Connect → Drivers → choose an older driver version to see it, or resolve the hosts once):
   `mongodb://<user>:<password>@<host0>:27017,<host1>:27017,<host2>:27017/souqly?tls=true&replicaSet=<replicaSetName>&authSource=admin&retryWrites=true&w=majority`
   On Vercel keep using the `mongodb+srv://` URI. Never commit or paste either URI anywhere; keep it only in your shell / `server/.env` (git-ignored).
2. Set, in `server/.env` or the shell for that one command: `NODE_ENV=production`, `MONGODB_URI=<non-SRV URI>`, the **same** `JWT_*` / `DATA_ENCRYPTION_KEY` as on Vercel, `ADMIN_EMAIL`, a strong `ADMIN_PASSWORD` (production seed refuses the default `souqly123` and anything under 12 characters), and the **same `CLOUDINARY_*`** as on Vercel — otherwise seed images are written to the local `server/uploads` folder and their `/uploads/...` URLs 404 on Vercel.
3. `npm run seed` (production skips demo users; add `-- --demo` only for a demo/staging database).
4. Put `NODE_ENV` back to `development` and clear `MONGODB_URI` in `server/.env` afterwards so `npm run dev` does not run against the real database (dev mode prints a loud warning if it does).

## What is different on Vercel

- **No Socket.io**: live order alerts, chat messages, typing, rider live location and forced socket disconnects are not pushed; the client polls (`realtime: false`). Every server emit is a no-op when no Socket.io server exists. Chat auto-reply treats staff as "offline" (still at most once per conversation per 12 h).
- **Scheduled jobs once a day** (Hobby allows only daily crons, triggered within the scheduled hour): product alert sweep (price-drop alerts after seller edits are still immediate), store health recompute, category-path consistency. Category moves recompute paths inline (the API answers `recompute: "done"`). Sweeps are registered in `server/src/services/jobs/sweeps.ts`; run one manually with `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/v1/internal/cron/<name|all>`.
- **Per-instance memory**: rate-limit counters, the rider-location throttle and small caches (settings, categories, email templates) live per warm instance, so limits are looser and cache invalidation can lag a few seconds between instances.
- **Uploads**: Cloudinary only. Max request body on Vercel functions is 4.5 MB, so videos larger than that cannot be uploaded through the API.
- **Duration**: one request (or one cron run) may take at most 60 s.
