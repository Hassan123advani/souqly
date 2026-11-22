# API contract — Phase 1 & 2 (config, auth, account)

Base: `/api/v1`. Success `{ data, meta? }`. Error `{ error: { code, message, details? } }`.
Cookies: `sq_at` (access, 15m), `sq_rt` (refresh, 30d, path `/api/v1/auth`). Client axios uses `withCredentials: true` and on a 401 with code `TOKEN_EXPIRED` calls `POST /auth/refresh` once, then retries.

## Types
```ts
type MeUser = {
  id: string; name: string; email: string; phone?: string; avatarUrl?: string;
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
- `POST /auth/login` body `loginSchema` → `{ data: { user } }`. Errors: `INVALID_CREDENTIALS` 401, `ACCOUNT_LOCKED` 423 (after 5 failures, 15 min), `TOTP_REQUIRED` 401 (2FA on, no code), `ACCOUNT_BLOCKED` 403.
- `POST /auth/logout` → 204 (revokes current session).
- `POST /auth/refresh` → `{ data: { user } }` (rotates refresh token).
- `GET /auth/me` → `{ data: { user } }` or 401.
- `POST /auth/otp/request` `{ phone }` → 200 `{ data: { sent: true, devCode?: string } }` (devCode only when no SMS provider AND NODE_ENV !== 'production'). Rate limited.
- `POST /auth/otp/verify` `{ phone, code }` → logs in (creates account if phone unknown with name "Souqly Shopper") → `{ data: { user, isNew } }`.
- `POST /auth/verify-email` `{ token }` → `{ data: { verified: true } }`; `POST /auth/resend-verification` (auth) → 200.
- `POST /auth/forgot-password` `{ email }` → always 200 (no user enumeration). `POST /auth/reset-password` `{ token, password }` → 200, revokes all sessions.
- `GET /auth/google` + `/auth/google/callback` → only when `GOOGLE_CLIENT_ID` set; else 404.

## Account (`/account`, all require auth)
- `GET /account/profile` → `{ data: { user } }`; `PATCH /account/profile` `{ name?, phone? }`.
- `POST /account/avatar` multipart `file` (jpg/png/webp ≤ 2MB) → `{ data: { avatarUrl } }`.
- `PATCH /account/preferences` partial preferences → `{ data: { user } }`.
- `POST /account/change-password` `changePasswordSchema` → 200; other sessions revoked; clears `passwordChangeRecommended`.
- `POST /account/change-email` `{ newEmail, password }` → 200; sends verification to new email; `emailVerified=false`.
- `GET /account/sessions` → `{ data: SessionInfo[] }`; `DELETE /account/sessions/:id`; `POST /account/sessions/revoke-all` (keeps current unless `{ includeCurrent: true }`).
- 2FA: `POST /account/2fa/setup` → `{ data: { secret, otpauthUrl, qrDataUrl } }`; `POST /account/2fa/enable` `{ code }`; `POST /account/2fa/disable` `{ code, password }`.
- Addresses: `GET /account/addresses`, `POST /account/addresses` (addressSchema), `PATCH /account/addresses/:id`, `DELETE /account/addresses/:id`, `POST /account/addresses/:id/default`.
- `POST /account/mode` `{ mode: 'buyer'|'seller' }` → `{ data: { user } }`. Switching to seller with `isSeller=false` → 409 `NEEDS_STORE` (client opens the Become-a-Seller wizard).
- `GET /account/export` → JSON file download of the user's data.
- `DELETE /account` `{ password, confirm: 'DELETE' }` → 204; anonymizes the user, revokes sessions. Blocked (409 `OWNS_STORE`) while the user owns an active store.
