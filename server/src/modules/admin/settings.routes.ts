import {
  FEATURE_FLAGS,
  PERMISSIONS,
  adminFeatureFlagsSchema,
  adminPaymentMethodsSchema,
  adminShippingZonesSchema,
  adminSiteSettingsSchema,
  adminTaxSettingsSchema,
} from '@souqly/shared';
import { Router, type RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { AppError } from '../../lib/AppError';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import { getFeatureFlags, getPaymentToggles, getShippingZones, getSiteSettings, getTaxSettings, setSetting } from '../settings/settings.service';
import { integrations } from '../../config/env';
import { can } from './common';

export const adminSettingsRouter = Router();

type Section = {
  path: string;
  key: string;
  schema: ZodTypeAny;
  get: () => Promise<unknown>;
  /** Converts the validated body to the stored value. */
  toStored?: (body: Record<string, unknown>) => unknown;
  check?: RequestHandler;
};

const unknownFlags: RequestHandler = (req, _res, next) => {
  const bad = Object.keys(req.body as object).filter((k) => !(k in FEATURE_FLAGS));
  next(bad.length ? new AppError(400, 'UNKNOWN_FLAG', 'Unknown feature flag', { flags: bad }) : undefined);
};

const sections: Section[] = [
  { path: 'site', key: 'site', schema: adminSiteSettingsSchema, get: getSiteSettings },
  // Partial updates merge over the current flags (only known flags are accepted).
  { path: 'feature-flags', key: 'featureFlags', schema: adminFeatureFlagsSchema, get: getFeatureFlags, check: unknownFlags },
  { path: 'payment-methods', key: 'paymentMethods', schema: adminPaymentMethodsSchema, get: getPaymentToggles },
  { path: 'shipping-zones', key: 'shippingZones', schema: adminShippingZonesSchema, get: async () => ({ zones: await getShippingZones() }), toStored: (b) => b.zones },
  { path: 'tax', key: 'tax', schema: adminTaxSettingsSchema, get: getTaxSettings },
];

/**
 * Payment methods: admin toggles + whether each integration's keys are configured (booleans only,
 * never key values), so the settings page does not need SYSTEM_VIEW / system health.
 */
adminSettingsRouter.get(
  '/settings/payments',
  ...can(PERMISSIONS.ADMIN_SETTINGS_MANAGE),
  asyncHandler(async (_req, res) => {
    const toggles = await getPaymentToggles();
    const configured = { cod: true, wallet: true, jazzcash: integrations.hasJazzCash, easypaisa: integrations.hasEasyPaisa, stripe: integrations.hasStripe };
    res.json({
      data: {
        toggles,
        integrations: configured,
        methods: (Object.keys(toggles) as (keyof typeof toggles)[]).map((m) => ({ method: m, enabled: toggles[m], configured: configured[m], available: toggles[m] && configured[m] })),
      },
    });
  }),
);

for (const s of sections) {
  adminSettingsRouter.get(
    `/settings/${s.path}`,
    ...can(PERMISSIONS.ADMIN_SETTINGS_MANAGE),
    asyncHandler(async (_req, res) => {
      res.json({ data: await s.get() });
    }),
  );
  adminSettingsRouter.put(
    `/settings/${s.path}`,
    ...can(PERMISSIONS.ADMIN_SETTINGS_MANAGE),
    validate({ body: s.schema }),
    ...(s.check ? [s.check] : []),
    asyncHandler(async (req, res) => {
      const body = req.body as Record<string, unknown>;
      const value = s.key === 'featureFlags' ? { ...(await getFeatureFlags()), ...body } : s.toStored ? s.toStored(body) : body;
      await setSetting(s.key, value);
      await audit({ action: `admin.settings_${s.key}_updated`, targetType: 'Setting', targetId: s.key, meta: s.key === 'featureFlags' || s.key === 'paymentMethods' ? body : { fields: Object.keys(body) }, req });
      res.json({ data: await s.get() });
    }),
  );
}
