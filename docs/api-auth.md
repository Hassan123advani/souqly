# API contract — Phase 1 & 2 (config, auth, account)

Base: `/api/v1`. Success `{ data, meta? }`. Error `{ error: { code, message, details? } }`.
Cookies: `sq_at` (access, 15m), `sq_rt` (refresh, 30d, path `/api/v1/auth`). Client axios uses `withCredentials: true` and on a 401 with code `TOKEN_EXPIRED` calls `POST /auth/refresh` once, then retries.

**Request format (CSRF hardening).** Every POST/PUT/PATCH/DELETE must send `Content-Type: application/json` (multipart/form-data only on upload routes: `/account/avatar`, `/seller/uploads`). Bodyless mutations must send `X-Requested-With: XMLHttpRequest` (the axios client sets it on every request). Anything else → 415 `UNSUPPORTED_MEDIA_TYPE`. urlencoded bodies are not parsed.

**Re-authentication.** Sensitive account actions take `password` (accounts with a password) or `otpCode` (passwordless accounts with a verified phone; get it from `POST /account/reauth/otp`). Missing → 400 `REAUTH_REQUIRED` with `details.method: 'password' | 'otp'`; wrong password → 400 `INVALID_PASSWORD`; wrong/expired code → 400 `OTP_INVALID` / `OTP_EXPIRED`. Google-only accounts (no password, no phone) have nothing to re-auth with and are allowed through. These endpoints also return 403 `IMPERSONATION_FORBIDDEN` while an admin is impersonating: change-password, change-email, phone change + verify, reauth OTP, 2FA setup/enable/disable, sessions revoke-all, delete account.

**Second-factor codes.** Wherever a `totp` is accepted (`/auth/login`, `/auth/otp/verify`, `/auth/google/2fa`, and `code` of `/account/2fa/disable`) the value may be a 6-digit authenticator code or one of the 8 single-use recovery codes (`XXXXX-XXXXX`, dash optional). Each authenticator code is accepted only once (replay → `INVALID_TOTP`).

## Types
```ts
type MeUser = {
  id: string; name: string; email: string;
  phone?: string;                        // always a VERIFIED number
  pendingPhone?: string;                 // new number waiting for POST /account/phone/verify
  avatarUrl?: string;
  emailVerified: boolean; phoneVerified: boolean;
  activeMode: 'buyer' | 'seller'; isSeller: boolean;
  platformRole?: 'SUPER_ADMIN'|'ADMIN'|'SUPPORT'|'MODERATOR'|'FINANCE';
  permissions: string[];                 // platform permissions (admin.*)
  stores: { id: string; slug: string; name: string; role: string; status: string; logoUrl?: string }[];
  passwordChangeRecommended: boolean;    // true for the seeded admin until they change it
  twoFactorEnabled: boolean;
  preferences: { language: 'en'|'ur'|'ar'; currency: 'PKR'|'SAR'|'AED'|'USD'; theme: 'light'|'dark'|'system';
                 notifications: { email: boolean; sms: boolean; push: boolean; marketing: boolean };
                 privacy: { showProfileInReviews: boolean; personalizedRecommendations: boolean } };
  referralCode: string; coins: number; walletBalance: number;   // walletBalance in minor units
  impersonatedBy?: string;               // set when an admin is impersonating
  createdAt: string;
};
type Address = AddressInput & { id: string }   // AddressInput from @souqly/shared
type SessionInfo = { id: string; userAgent: string; ip: string; createdAt: string; lastUsedAt: string; current: boolean };
```

## Public config
- `GET /config/public` → `{ data: { site: { name, tagline, maintenance: boolean, announcement?: { text, link?, tone } }, integrations: { googleLogin: boolean, cloudStorage: boolean, email: boolean, sms: boolean, webPush: boolean, vapidPublicKey?: string, payments: { cod: true, jazzcash: boolean, easypaisa: boolean, stripe: boolean, wallet: boolean } }, flags: Record<string, boolean>, devMode: boolean } }`

## Auth (`/auth`)
- `POST /auth/signup` body `signupSchema` → 201 `{ data: { user: MeUser } }` + cookies. Sends verification email (console in dev).
- `POST /auth/login` body `loginSchema` (`totp` = authenticator or recovery code) → `{ data: { user } }`. Errors: `INVALID_CREDENTIALS` 401 (wrong password, unknown account AND locked account all look the same; 5 failures lock sign-in for 15 min), `TOTP_REQUIRED` 401 (2FA on, no code), `INVALID_TOTP` 401, `ACCOUNT_BLOCKED` 403. `ACCOUNT_LOCKED` 423 is no longer returned.
- `POST /auth/logout` → 204 (revokes current session).
- `POST /auth/refresh` → `{ data: { user } }` (rotates refresh token).
- `GET /auth/me` → `{ data: { user } }` or 401.
- `POST /auth/otp/request` `{ phone }` → 200 `{ data: { sent: true, devCode?: string } }` (devCode only when no SMS provider AND `DEV_OTP_ECHO=1`, which production rejects). Rate limited per normalized phone (5/15 min) and per IP (20/15 min).
- `POST /auth/otp/verify` `{ phone, code, totp? }` → logs in → `{ data: { user, isNew } }`. Only an account whose phone is VERIFIED matches; otherwise a new account is created (name "Souqly Shopper") and any unverified holder of that number loses it. Own rate limits (10/15 min per phone, 30 per IP).
- `POST /auth/verify-email` `{ token }` → `{ data: { verified: true } }`; `POST /auth/resend-verification` (auth) → 200.
- `POST /auth/forgot-password` `{ email }` → always 200 immediately (the email is sent in the background; no user enumeration). `POST /auth/reset-password` `{ token, password }` → 200, revokes all sessions. A reset link dies when the password or email changes.
- `GET /auth/google` + `/auth/google/callback` → only when `GOOGLE_CLIENT_ID` set; else 404. The callback redirects to `CLIENT_URL` (session cookies set) or to `CLIENT_URL/login?error=<reason>`. **When the account has 2FA** no session is created; the browser is sent to `CLIENT_URL/login?google2fa=<ticket>` (ticket valid 5 min, single use, dies after 5 wrong codes).
- `POST /auth/google/2fa` `{ ticket, totp }` (`googleTwoFactorSchema`; `totp` = authenticator or recovery code) → `{ data: { user } }` + cookies. Errors: 401 `INVALID_TICKET` (expired/used/burned → start Google sign-in again), 401 `INVALID_TOTP` with `details.attemptsLeft`, 429 `TOO_MANY_ATTEMPTS` (account lockout), 429 `RATE_LIMITED`.
- Google linking: an existing account is linked to Google by email only if its email is verified. If it is NOT verified, the account is first reset (password, 2FA, phone, sessions and outstanding links removed; audit `auth.google_link_reset`) because whoever registered it never proved the address.

## Account (`/account`, all require auth)
- `GET /account/profile` → `{ data: { user } }`.
- `PATCH /account/profile` `{ name?, phone?, password?, otpCode? }` → `{ data: { user, phoneVerification?: { sent: true, devCode? } } }`. `name` applies at once. A new `phone` is NOT set: it is stored as `user.pendingPhone` and an OTP is sent to it; re-auth (`password` / `otpCode`) is required when the account already has a password or verified phone. Sending the current verified phone cancels a pending change. Errors: 409 `PHONE_TAKEN` (verified on another account), `REAUTH_REQUIRED`, 403 `IMPERSONATION_FORBIDDEN`.
- `POST /account/phone/verify` `{ code }` → `{ data: { user } }` — moves `pendingPhone` to `phone` (`phoneVerified: true`). Errors: 400 `NO_PENDING_PHONE`, `OTP_INVALID` (`details.attemptsLeft`), `OTP_EXPIRED`, 409 `PHONE_TAKEN` (the number was verified by another account meanwhile; the pending change is cleared). A notice email is sent.
- `POST /account/reauth/otp` (no body) → `{ data: { sent: true, devCode? } }` — sends a re-auth code to the verified phone of a PASSWORDLESS account. Errors: 400 `USE_PASSWORD` (account has a password), 400 `NO_VERIFIED_PHONE`. One code is valid for 5 min; `2fa/setup` checks it without using it so the same code also confirms `2fa/enable`.
- `POST /account/avatar` multipart `file` (jpg/png/webp ≤ 2MB) → `{ data: { avatarUrl } }`.
- `PATCH /account/preferences` partial preferences → `{ data: { user } }`.
- `POST /account/change-password` `changePasswordSchema` → 200; other sessions revoked; clears `passwordChangeRecommended`.
- `POST /account/change-email` `{ newEmail, password }` → `{ data: { changed: true, verificationSent: true, revokedSessions } }`; sends verification to the new email (`emailVerified=false`), revokes all OTHER sessions, invalidates reset links and sends a notice to the OLD address.
- `GET /account/sessions` → `{ data: SessionInfo[] }`; `DELETE /account/sessions/:id`; `POST /account/sessions/revoke-all` (keeps current unless `{ includeCurrent: true }`). Revoked sessions' sockets are disconnected.
- 2FA (all need re-auth; never while impersonating):
  - `POST /account/2fa/setup` `{ password? , otpCode? }` → `{ data: { secret, otpauthUrl, qrDataUrl } }`.
  - `POST /account/2fa/enable` `{ code, password?, otpCode? }` → `{ data: { enabled: true, recoveryCodes: string[8] } }` — **show the recovery codes once** (only hashes are stored). Sends a notice email.
  - `POST /account/2fa/disable` `{ code, password?, otpCode? }` (`code` = authenticator or recovery code) → `{ data: { enabled: false } }`. Sends a notice email.
- Addresses: `GET /account/addresses`, `POST /account/addresses` (addressSchema), `PATCH /account/addresses/:id`, `DELETE /account/addresses/:id`, `POST /account/addresses/:id/default`.
- `POST /account/mode` `{ mode: 'buyer'|'seller' }` → `{ data: { user } }`. Switching to seller with `isSeller=false` → 409 `NEEDS_STORE` (client opens the Become-a-Seller wizard).
- `GET /account/export` → JSON file download of the user's data.
- `DELETE /account` `{ password? , otpCode?, confirm: 'DELETE' }` (re-auth as above) → 204; anonymizes the user, revokes sessions. Blocked (409 `OWNS_STORE`) while the user owns an active store; 403 `IMPERSONATION_FORBIDDEN` while impersonating.

## Seller Center
- `storeContext` returns 403 `STORE_SUSPENDED` (`details.status`) for `suspended` / `rejected` stores. `pending` stores can still use the Seller Center to set up products.
