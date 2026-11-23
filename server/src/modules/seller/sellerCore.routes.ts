import {
  PERMISSIONS,
  chatSettingsSchema,
  dashboardQuerySchema,
  notificationSettingsSchema,
  shippingSettingsSchema,
  storeUpdateSchema,
} from '@souqly/shared';
import { Router, type RequestHandler } from 'express';
import type { Types } from 'mongoose';
import type { ZodTypeAny } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { requirePermission } from '../../middleware/permissions';
import { validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import { getDashboard } from './dashboard.service';
import * as store from './store.service';
import { getChatSettings, getNotificationSettings, getShippingSettings, saveSection } from './storeSettings.service';

/** Mounted inside sellerRouter (requireAuth + storeContext already applied). storeId ONLY from req.store. */
export const sellerCoreRouter = Router();
const SETTINGS = requirePermission(PERMISSIONS.STORE_SETTINGS_MANAGE);

sellerCoreRouter.patch(
  '/store',
  SETTINGS,
  validate({ body: storeUpdateSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await store.updateStore(req, req.body) });
  }),
);

sellerCoreRouter.post(
  '/store/mall-request',
  SETTINGS,
  asyncHandler(async (req, res) => {
    res.json({ data: await store.requestMall(req) });
  }),
);

sellerCoreRouter.get(
  '/dashboard',
  requirePermission(PERMISSIONS.STORE_DASHBOARD),
  validate({ query: dashboardQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await getDashboard(req.store!, (req.query as { range: '7d' | '30d' | '90d' }).range) });
  }),
);

// ---- settings ----
type Section = {
  key: 'shipping' | 'notifications' | 'chat';
  schema: ZodTypeAny;
  perm: RequestHandler;
  get: (storeId: Types.ObjectId) => Promise<object>;
  /** Partial sections merge over the current values; shipping is replaced as a whole. */
  merge: boolean;
};
const sections: Section[] = [
  { key: 'shipping', schema: shippingSettingsSchema, perm: SETTINGS, get: getShippingSettings, merge: false },
  { key: 'notifications', schema: notificationSettingsSchema, perm: SETTINGS, get: getNotificationSettings, merge: true },
  { key: 'chat', schema: chatSettingsSchema, perm: requirePermission(PERMISSIONS.STORE_CHAT_MANAGE), get: getChatSettings, merge: true },
];

for (const s of sections) {
  sellerCoreRouter.get(
    `/settings/${s.key}`,
    s.perm,
    asyncHandler(async (req, res) => {
      res.json({ data: await s.get(req.store!._id) });
    }),
  );
  sellerCoreRouter.put(
    `/settings/${s.key}`,
    s.perm,
    validate({ body: s.schema }),
    asyncHandler(async (req, res) => {
      const value = s.merge ? { ...(await s.get(req.store!._id)), ...req.body } : req.body;
      await saveSection(req.store!._id, s.key, value);
      await audit({ action: `store.settings_${s.key}_updated`, targetType: 'Store', targetId: req.store!._id, req });
      res.json({ data: await s.get(req.store!._id) });
    }),
  );
}
