import { PLANS, PLATFORM_COMMISSION_BPS, type PublicConfig } from '@souqly/shared';
import { Router } from 'express';
import mongoose from 'mongoose';
import { env, integrations, isProd } from '../../config/env';
import { isInMemoryDb } from '../../config/db';
import { asyncHandler } from '../../lib/asyncHandler';
import { paymentAvailability } from '../../services/payment';
import { getFeatureFlags, getPaymentToggles, getSiteSettings } from '../settings/settings.service';

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
    const [flags, site, toggles] = await Promise.all([getFeatureFlags(), getSiteSettings(), getPaymentToggles()]);
    // The AI description helper needs an API key even when the flag is on.
    if (!integrations.hasOpenAI) flags.aiDescriptionHelper = false;
    if (!integrations.hasAnthropic) flags.aiAutoReview = false;
    const payments = paymentAvailability();
    const data: PublicConfig = {
      site,
      integrations: {
        googleLogin: integrations.hasGoogleAuth,
        cloudStorage: integrations.hasCloudinary,
        email: integrations.hasSmtp,
        sms: integrations.hasTwilio,
        webPush: integrations.hasVapid,
        realtime: !env.SERVERLESS,
        ...(integrations.hasVapid ? { vapidPublicKey: env.VAPID_PUBLIC_KEY } : {}),
        // Wallet payments arrive with the wallet phase.
        // A method is offered only when its keys are present AND the admin has it enabled.
        payments: {
          cod: toggles.cod,
          jazzcash: payments.jazzcash && toggles.jazzcash,
          easypaisa: payments.easypaisa && toggles.easypaisa,
          stripe: payments.stripe && toggles.stripe,
          wallet: false,
        },
      },
      flags,
      devMode: !isProd,
      // Seller plans + flat commission for the plan page and the Become-a-Seller wizard (docs/api-billing.md).
      billing: { commissionBps: PLATFORM_COMMISSION_BPS, plans: Object.values(PLANS) },
    };
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.json({ data });
  }),
);
