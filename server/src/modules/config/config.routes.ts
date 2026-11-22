import type { PublicConfig } from '@souqly/shared';
import { Router } from 'express';
import mongoose from 'mongoose';
import { env, integrations, isProd } from '../../config/env';
import { isInMemoryDb } from '../../config/db';
import { asyncHandler } from '../../lib/asyncHandler';
import { paymentAvailability } from '../../services/payment';
import { getFeatureFlags, getSiteSettings } from '../settings/settings.service';

export const configRouter = Router();

configRouter.get('/health', (_req, res) => {
  res.json({
    data: {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      inMemoryDb: isInMemoryDb(),
      time: new Date().toISOString(),
    },
  });
});

configRouter.get(
  '/config/public',
  asyncHandler(async (_req, res) => {
    const [flags, site] = await Promise.all([getFeatureFlags(), getSiteSettings()]);
    // The AI description helper needs an API key even when the flag is on.
    if (!integrations.hasOpenAI) flags.aiDescriptionHelper = false;
    const payments = paymentAvailability();
    const data: PublicConfig = {
      site: { name: 'Souqly', tagline: 'Every shop, one souq.', ...site },
      integrations: {
        googleLogin: integrations.hasGoogleAuth,
        cloudStorage: integrations.hasCloudinary,
        email: integrations.hasSmtp,
        sms: integrations.hasTwilio,
        webPush: integrations.hasVapid,
        ...(integrations.hasVapid ? { vapidPublicKey: env.VAPID_PUBLIC_KEY } : {}),
        // Wallet payments arrive with the wallet phase.
        payments: { cod: true, jazzcash: payments.jazzcash, easypaisa: payments.easypaisa, stripe: payments.stripe, wallet: false },
      },
      flags,
      devMode: !isProd,
    };
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.json({ data });
  }),
);
