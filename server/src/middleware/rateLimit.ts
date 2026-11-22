import type { Request } from 'express';
import rateLimit, { type Options } from 'express-rate-limit';
import { isTest } from '../config/env';
import { normalizePhone } from '../lib/phone';

/** Tests exercise lockout/OTP logic directly; set TEST_RATE_LIMIT=1 to test the limiters themselves. */
const skip = () => isTest && process.env.TEST_RATE_LIMIT !== '1';

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
    keyGenerator: (req) => `${ip(req)}|${bodyField(req, 'email')}`,
  }),
  /** OTP requests: 5 / 15 min per phone (any IP) and 20 / 15 min per IP (any phone). */
  otpRequest: [
    make(window15, 5, 'Too many code requests for this number. Please wait a few minutes.', {
      keyGenerator: (req) => `otp-req-phone|${phoneKey(req)}`,
    }),
    make(window15, 20, 'Too many code requests. Please wait a few minutes.', {
      keyGenerator: (req) => `otp-req-ip|${ip(req)}`,
    }),
  ],
  /** OTP verification: 10 / 15 min per phone and 30 / 15 min per IP (each code also dies after 5 misses). */
  otpVerify: [
    make(window15, 10, 'Too many attempts for this number. Please wait a few minutes.', {
      keyGenerator: (req) => `otp-verify-phone|${phoneKey(req)}`,
    }),
    make(window15, 30, 'Too many attempts. Please wait a few minutes.', {
      keyGenerator: (req) => `otp-verify-ip|${ip(req)}`,
    }),
  ],
  /** Account OTPs (re-auth, phone change) and their verification: 10 / 15 min per user. */
  accountOtp: make(window15, 10, 'Too many code requests. Please wait a few minutes.', {
    keyGenerator: (req) => `acct-otp|${req.user?.id ?? ip(req)}`,
  }),
  /** Google 2FA step: 10 / 15 min per IP (tickets and the account lockout also cap attempts). */
  google2fa: make(window15, 10, 'Too many attempts. Please wait a few minutes.', {
    keyGenerator: (req) => `g2fa|${ip(req)}`,
  }),
  /** 5 password reset emails / hour per IP. */
  passwordReset: make(60 * 60_000, 5, 'Too many reset requests. Please try again later.'),
  search: make(60_000, 60, 'You are searching too fast. Please slow down.'),
  general: make(60_000, 300, 'Too many requests. Please slow down.'),
};
