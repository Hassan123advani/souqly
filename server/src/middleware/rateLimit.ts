import type { Request } from 'express';
import rateLimit, { type Options } from 'express-rate-limit';
import { isTest } from '../config/env';

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

const ip = (req: Request) => req.ip ?? 'unknown';
const bodyField = (req: Request, field: string) => {
  const v = (req.body as Record<string, unknown> | undefined)?.[field];
  return typeof v === 'string' ? v.trim().toLowerCase().slice(0, 254) : '';
};

export const rateLimits = {
  /** 10 login attempts / 15 min per IP + email (account lockout handles the rest). */
  login: make(15 * 60_000, 10, 'Too many login attempts. Please wait a few minutes.', {
    keyGenerator: (req) => `${ip(req)}|${bodyField(req, 'email')}`,
  }),
  /** 5 OTP requests / 15 min per IP + phone. */
  otp: make(15 * 60_000, 5, 'Too many code requests. Please wait a few minutes.', {
    keyGenerator: (req) => `${ip(req)}|${bodyField(req, 'phone')}`,
  }),
  /** 5 password reset emails / hour per IP. */
  passwordReset: make(60 * 60_000, 5, 'Too many reset requests. Please try again later.'),
  search: make(60_000, 60, 'You are searching too fast. Please slow down.'),
  general: make(60_000, 300, 'Too many requests. Please slow down.'),
};
