# Security review — Phase 1–2 (server/src, shared/src)

Status: RESOLVED — all findings fixed with regression tests (`server/src/modules/auth/security.test.ts`, L4 in `server/src/modules/stores/tenant.test.ts`). See DECISIONS.md D-038…D-044.

## HIGH
- **H1** Google login skips 2FA (`modules/auth/google.ts`). Fix: if 2FA enabled, issue short-lived single-use hashed ticket (Token type `google_2fa`), redirect to `/login/2fa?ticket=`, add `POST /auth/google/2fa {ticket, totp}` with failure counting.
  - **FIXED** — the callback creates no session when 2FA is on; it issues a sha256-stored `google_2fa` Token (5 min, single use, burned after 5 wrong codes) and redirects to `CLIENT_URL/login?google2fa=<ticket>`. `POST /auth/google/2fa {ticket, totp}` accepts TOTP or recovery code, counts failures on the ticket AND the account lockout, rate limited. Documented in docs/api-auth.md.
- **H2** Google auto-links to an existing account with an UNVERIFIED email → takeover. Fix: only auto-link when `emailVerified === true`; otherwise reset untrusted account (unset passwordHash, clear 2FA, revoke all sessions, invalidate tokens, audit `auth.google_link_reset`).
  - **FIXED** — `handleGoogleProfile` links by email only when verified; otherwise it first removes password, 2FA (secret/recovery codes), phone/pendingPhone, revokes all sessions, invalidates all tokens and user-bound OTPs, audits `auth.google_link_reset`.
- **H3** Production accepts default admin password `souqly123`. Fix: production env requires ADMIN_PASSWORD ≥ 12 chars and ≠ `souqly123`; seed refuses default in prod; skip demo users in prod unless `--demo`.
  - **FIXED** — env validation rejects a missing/default/deny-listed/short (< 12) `ADMIN_PASSWORD` in production; `ensureSuperAdmin` refuses it too; `runSeed` skips demo buyers/stores in production unless `npm run seed -- --demo`.

## MEDIUM
- **M1** `trust proxy` hard-coded to 1 → XFF forgery bypasses rate limits. Fix: `TRUST_PROXY` env (default false).
  - **FIXED** — `TRUST_PROXY` (false by default; hop count, `loopback`, or IP/CIDR list; `true` rejected in production) feeds `app.set('trust proxy')`.
- **M2** Lockout race with parallel requests. Fix: atomic attempt reservation via `findOneAndUpdate` before bcrypt; conditional reset on success.
  - **FIXED** — `reserveLoginAttempt` atomically increments `failedLoginCount` only while `< 5` and unlocked; failures lock once the budget is used; success resets only if the account is still unlocked. Test: 15 parallel guesses → exactly 5 bcrypt checks.
- **M3** 2FA enable needs no re-auth → hijacked session can lock owner out. Fix: require password (or fresh OTP for passwordless), email notice, recovery codes, block while impersonating.
  - **FIXED** — `2fa/setup`, `2fa/enable`, `2fa/disable` require `password` (or `otpCode` from `POST /account/reauth/otp` for passwordless accounts); enable returns 8 single-use recovery codes (sha256 stored) accepted wherever a TOTP is; notice emails on enable/disable/recovery-code use; blocked while impersonating. Shared schemas + docs updated.
- **M4** OTP login matches UNVERIFIED phone → squatting. Fix: look up `{phone, phoneVerified:true}`; pending-phone flow verified by OTP; uniqueness only on verified phones.
  - **FIXED** — OTP login only matches verified phones (unverified legacy holders lose the number). `PATCH /account/profile {phone}` stores `pendingPhone` and texts an OTP; `POST /account/phone/verify {code}` sets the verified `phone`. Unique index `phone_verified_unique` covers verified phones only (legacy `phone_1` dropped on boot).
- **M5** Console email fallback prints reset links in production. Fix: require SMTP in prod or redact body when isProd.
  - **FIXED** — `ConsoleEmailService` redacts in production: only a masked recipient + subject are printed, nothing is kept in the outbox.
- **M6** devCode echo depends on NODE_ENV default. Fix: explicit `DEV_OTP_ECHO=1` opt-in, rejected in prod; loud error if non-local MONGODB_URI with non-prod NODE_ENV.
  - **FIXED** — `devCode` only when no Twilio AND `DEV_OTP_ECHO=1` (default off; `.env.example` sets 1 for local dev). Env validation rejects it in production and with a non-local `MONGODB_URI`; development + non-local MongoDB prints a red warning banner. The OTP code itself is never logged.

## LOW
- **L1** Change-email: invalidate reset tokens, notify old address, revoke other sessions.
  - **FIXED** — reset links invalidated (and reset now also requires the link's email to match the account), other sessions revoked (`revokedSessions` in the response), masked notice to the old address.
- **L2** Enumeration: fire-and-forget reset email; generic 401 while locked.
  - **FIXED** — `/auth/forgot-password` responds before the lookup/email; a locked account returns the same 401 `INVALID_CREDENTIALS` as a wrong password / unknown account (no 423).
- **L3** TOTP replay: store `twoFactor.lastStep`.
  - **FIXED** — the accepted time step is stored atomically; the same or older step is rejected.
- **L4** storeContext must reject suspended/rejected stores.
  - **FIXED** — 403 `STORE_SUSPENDED`; pending stores keep access to set up products.
- **L5** Socket: `allowRequest` origin check; disconnect sockets on session revoke.
  - **FIXED** — handshakes from a foreign `Origin` are refused; sockets join `session:<sid>` and are disconnected by `revokeSession` / `revokeAllSessions`.
- **L6** OTP limiter: key on normalized phone, per-IP cap, separate request/verify limiters.
  - **FIXED** — request: 5/15 min per normalized phone + 20/15 min per IP; verify: 10 per phone + 30 per IP; separate buckets.
- **L7** `forbidWhileImpersonating` on credential/security endpoints.
  - **FIXED** — middleware applied to change-password, change-email, phone change/verify, reauth OTP, 2FA setup/enable/disable, sessions revoke-all, delete account.
- **L8** Require `DATA_ENCRYPTION_KEY` in production.
  - **FIXED** — required (≥ 32 chars) by production env validation.
- **L9** CSRF: drop urlencoded parser on API; require JSON content-type or `x-requested-with` on mutations.
  - **FIXED** — no urlencoded parser; mutations need `application/json` (multipart only on upload routes) or, when bodyless, `X-Requested-With` → otherwise 415 `UNSUPPORTED_MEDIA_TYPE`.
- **L10** Passwordless accounts need fresh OTP re-auth for destructive actions.
  - **FIXED** — `requireReauth` (password, else OTP to the verified phone) on 2FA changes, phone change and account deletion.
- **L11** Strip query string from request logs for `/auth/google/callback`.
  - **FIXED** — the pino request serializer logs `/api/v1/auth/google/callback?[REDACTED]`.
