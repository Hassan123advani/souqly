import { LOYALTY, PERMISSIONS, adminGiftCardCreateSchema, giftCardRedeemSchema, pageQuerySchema } from '@souqly/shared';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/permissions';
import { validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import { checkIn, checkInStatus, coinBalance, coinHistory } from './coins.service';
import { requireFlag } from './flags';
import { socialLimits } from './limits';
import { createGiftCard, listGiftCards, redeemGiftCard, referralSummary } from './rewards.service';

/** Mounted at `/` : /coins, /referrals, /gift-cards. */
export const loyaltyRouter = Router();

loyaltyRouter.get(
  '/coins',
  requireAuth,
  requireFlag('loyaltyCoins'),
  validate({ query: pageQuerySchema }),
  asyncHandler(async (req, res) => {
    const [balance, history] = await Promise.all([coinBalance(req.user!.id), coinHistory(req.user!.id, req.query as never)]);
    res.json({ data: { balance, worth: balance * LOYALTY.COIN_VALUE_MINOR, history: history.items }, meta: { nextCursor: history.nextCursor } });
  }),
);

loyaltyRouter.get(
  '/coins/check-in',
  requireAuth,
  requireFlag('dailyCheckIn'),
  asyncHandler(async (req, res) => {
    res.json({ data: await checkInStatus(req.user!.id) });
  }),
);

loyaltyRouter.post(
  '/coins/check-in',
  requireAuth,
  requireFlag('dailyCheckIn'),
  asyncHandler(async (req, res) => {
    res.status(201).json({ data: await checkIn(req.user!.id) });
  }),
);

loyaltyRouter.get(
  '/referrals',
  requireAuth,
  requireFlag('referrals'),
  asyncHandler(async (req, res) => {
    res.json({ data: await referralSummary(req.user!.id) });
  }),
);

loyaltyRouter.post(
  '/gift-cards/redeem',
  requireAuth,
  requireFlag('giftCards'),
  socialLimits.giftCardRedeem,
  validate({ body: giftCardRedeemSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await redeemGiftCard(req.user!.id, req.body.code) });
  }),
);

/** Mounted at `/admin/gift-cards`. */
export const adminGiftCardsRouter = Router();
adminGiftCardsRouter.use(requireAuth);

adminGiftCardsRouter.get(
  '/',
  requirePermission(PERMISSIONS.ADMIN_FINANCE_VIEW),
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }) }),
  asyncHandler(async (req, res) => {
    res.json({ data: await listGiftCards(req.query as never) });
  }),
);

adminGiftCardsRouter.post(
  '/',
  requirePermission(PERMISSIONS.ADMIN_FINANCE_MANAGE),
  validate({ body: adminGiftCardCreateSchema }),
  asyncHandler(async (req, res) => {
    const card = await createGiftCard({ ...req.body, createdBy: req.user!.id });
    await audit({ action: 'giftcard.created', req, targetType: 'GiftCard', targetId: card.id, meta: { amount: card.amount } });
    res.status(201).json({ data: card });
  }),
);
