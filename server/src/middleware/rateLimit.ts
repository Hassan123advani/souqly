import type { Request } from 'express';
import rateLimit, { type Options } from 'express-rate-limit';
import { env, isTest } from '../config/env';
import { normalizePhone } from '../lib/phone';
import { MongoRateLimitStore } from './rateLimitStore';

/** Tests exercise lockout/OTP logic directly; set TEST_RATE_LIMIT=1 to test the limiters themselves. */
const skip = () => isTest && process.env.TEST_RATE_LIMIT !== '1';

/**
 * Store for the security-critical limiters (login, OTP, password reset, 2FA): shared in MongoDB when
 * serverless (every Vercel instance would otherwise have its own budget, security review M4); in-memory
 * locally and in tests. `RATE_LIMIT_STORE=mongo` forces the shared store (used by its tests).
 */
export function sharedStore(name: string): Partial<Options> {
  const mongo = env.SERVERLESS || process.env.RATE_LIMIT_STORE === 'mongo';
  return mongo ? { store: new MongoRateLimitStore(name) } : {};
}

function make(windowMs: number, limit: number, message: string, extra: Partial<Options> = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip,
    handler: (_req, res, _next, options) => {
      res.status(options.statusCode).json({ error: { code: 'RATE_LIMITED', message } });
    },
    ...extra,
  });
}

/** req.ip honours TRUST_PROXY (default off), so X-Forwarded-For cannot be forged to dodge limits. */
const ip = (req: Request) => req.ip ?? 'unknown';
const bodyField = (req: Request, field: string) => {
  const v = (req.body as Record<string, unknown> | undefined)?.[field];
  return typeof v === 'string' ? v.trim().toLowerCase().slice(0, 254) : '';
};
/** Same normalization as the OTP service, so "+92 300-1234567" and "923001234567" share one bucket. */
const phoneKey = (req: Request) => {
  const raw = bodyField(req, 'phone');
  return raw ? normalizePhone(raw).slice(0, 20) : '';
};
const window15 = 15 * 60_000;

export const rateLimits = {
  /** 10 login attempts / 15 min per IP + email (account lockout handles the rest). */
  login: make(window15, 10, 'Too many login attempts. Please wait a few minutes.', {
    ...sharedStore('login'),
    keyGenerator: (req) => `${ip(req)}|${bodyField(req, 'email')}`,
  }),
  /** OTP requests: 5 / 15 min per phone (any IP) and 20 / 15 min per IP (any phone). */
  otpRequest: [
    make(window15, 5, 'Too many code requests for this number. Please wait a few minutes.', {
      ...sharedStore('otp-req-phone'),
      keyGenerator: (req) => `otp-req-phone|${phoneKey(req)}`,
    }),
    make(window15, 20, 'Too many code requests. Please wait a few minutes.', {
      ...sharedStore('otp-req-ip'),
      keyGenerator: (req) => `otp-req-ip|${ip(req)}`,
    }),
  ],
  /** OTP verification: 10 / 15 min per phone and 30 / 15 min per IP (each code also dies after 5 misses). */
  otpVerify: [
    make(window15, 10, 'Too many attempts for this number. Please wait a few minutes.', {
      ...sharedStore('otp-verify-phone'),
      keyGenerator: (req) => `otp-verify-phone|${phoneKey(req)}`,
    }),
    make(window15, 30, 'Too many attempts. Please wait a few minutes.', {
      ...sharedStore('otp-verify-ip'),
      keyGenerator: (req) => `otp-verify-ip|${ip(req)}`,
    }),
  ],
  /** Account OTPs (re-auth, phone change) and their verification: 10 / 15 min per user. */
  accountOtp: make(window15, 10, 'Too many code requests. Please wait a few minutes.', {
    ...sharedStore('account-otp'),
    keyGenerator: (req) => `acct-otp|${req.user?.id ?? ip(req)}`,
  }),
  /** Google 2FA step: 10 / 15 min per IP (tickets and the account lockout also cap attempts). */
  google2fa: make(window15, 10, 'Too many attempts. Please wait a few minutes.', {
    ...sharedStore('google2fa'),
    keyGenerator: (req) => `g2fa|${ip(req)}`,
  }),
  /** 5 password reset emails / hour per IP. */
  passwordReset: make(60 * 60_000, 5, 'Too many reset requests. Please try again later.', sharedStore('password-reset')),
  search: make(60_000, 60, 'You are searching too fast. Please slow down.'),
  /** Placing orders (per user; mount after requireAuth). */
  checkout: make(10 * 60_000, 30, 'Too many checkout attempts. Please wait a few minutes.', { keyGenerator: (req) => `u:${req.user?.id ?? ip(req)}` }),
  general: make(60_000, 300, 'Too many requests. Please slow down.'),
};
