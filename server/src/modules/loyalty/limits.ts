import rateLimit from 'express-rate-limit';
import { isTest } from '../../config/env';

const skip = () => isTest && process.env.TEST_RATE_LIMIT !== '1';

function make(windowMs: number, limit: number, message: string) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip,
    keyGenerator: (req) => `u:${req.user?.id ?? req.ip ?? 'unknown'}`,
    handler: (_req, res, _next, options) => {
      res.status(options.statusCode).json({ error: { code: 'RATE_LIMITED', message } });
    },
  });
}

/** Per-user limits for Phase 8 write endpoints (must run after requireAuth). */
export const socialLimits = {
  /** Gift card codes are guessable only by brute force: keep attempts low. */
  giftCardRedeem: make(60 * 60_000, 10, 'Too many gift card attempts. Please try again later.'),
  write: make(60 * 60_000, 60, 'You are posting too fast. Please slow down.'),
  chat: make(60_000, 40, 'You are sending messages too fast.'),
  upload: make(60 * 60_000, 60, 'Too many uploads. Please try again later.'),
};
