import { pageQuerySchema } from '@souqly/shared';
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { getBalance, listTransactions } from './wallet.service';

export const walletRouter = Router();
walletRouter.use(requireAuth);

walletRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ data: { balance: await getBalance(req.user!.id) } });
  }),
);

walletRouter.get(
  '/transactions',
  validate({ query: pageQuerySchema }),
  asyncHandler(async (req, res) => {
    const { items, nextCursor } = await listTransactions(req.user!.id, req.query as never);
    res.json({ data: items, meta: { nextCursor } });
  }),
);
