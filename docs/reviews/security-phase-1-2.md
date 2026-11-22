# Security review — Phase 1–2 (server/src, shared/src)

Status: OPEN — to be fixed after Phase 3 backend merges.

## HIGH
- **H1** Google login skips 2FA (`modules/auth/google.ts`). Fix: if 2FA enabled, issue short-lived single-use hashed ticket (Token type `google_2fa`), redirect to `/login/2fa?ticket=`, add `POST /auth/google/2fa {ticket, totp}` with failure counting.
- **H2** Google auto-links to an existing account with an UNVERIFIED email → takeover. Fix: only auto-link when `emailVerified === true`; otherwise reset untrusted account (unset passwordHash, clear 2FA, revoke all sessions, invalidate tokens, audit `auth.google_link_reset`).
- **H3** Production accepts default admin password `souqly123`. Fix: production env requires ADMIN_PASSWORD ≥ 12 chars and ≠ `souqly123`; seed refuses default in prod; skip demo users in prod unless `--demo`.

## MEDIUM
- **M1** `trust proxy` hard-coded to 1 → XFF forgery bypasses rate limits. Fix: `TRUST_PROXY` env (default false).
- **M2** Lockout race with parallel requests. Fix: atomic attempt reservation via `findOneAndUpdate` before bcrypt; conditional reset on success.
- **M3** 2FA enable needs no re-auth → hijacked session can lock owner out. Fix: require password (or fresh OTP for passwordless), email notice, recovery codes, block while impersonating.
- **M4** OTP login matches UNVERIFIED phone → squatting. Fix: look up `{phone, phoneVerified:true}`; pending-phone flow verified by OTP; uniqueness only on verified phones.
- **M5** Console email fallback prints reset links in production. Fix: require SMTP in prod or redact body when isProd.
- **M6** devCode echo depends on NODE_ENV default. Fix: explicit `DEV_OTP_ECHO=1` opt-in, rejected in prod; loud error if non-local MONGODB_URI with non-prod NODE_ENV.

## LOW
- **L1** Change-email: invalidate reset tokens, notify old address, revoke other sessions.
- **L2** Enumeration: fire-and-forget reset email; generic 401 while locked.
- **L3** TOTP replay: store `twoFactor.lastStep`.
- **L4** storeContext must reject suspended/rejected stores.
- **L5** Socket: `allowRequest` origin check; disconnect sockets on session revoke.
- **L6** OTP limiter: key on normalized phone, per-IP cap, separate request/verify limiters.
- **L7** `forbidWhileImpersonating` on credential/security endpoints.
- **L8** Require `DATA_ENCRYPTION_KEY` in production.
- **L9** CSRF: drop urlencoded parser on API; require JSON content-type or `x-requested-with` on mutations.
- **L10** Passwordless accounts need fresh OTP re-auth for destructive actions.
- **L11** Strip query string from request logs for `/auth/google/callback`.
