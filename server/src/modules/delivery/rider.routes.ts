import {
  deliverSchema,
  deliveryFailSchema,
  objectIdSchema,
  riderDeliveryListQuerySchema,
  riderLocationSchema,
  type DeliverInput,
  type DeliveryFailReason,
  type RiderDeliveryListQuery,
  type RiderLocationInput,
} from '@souqly/shared';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import { openUploadRef, singleImage, storeUploadedImage } from './imageUpload';
import * as svc from './rider.service';

/** Rider PWA API (mounted at /rider). Access = active store membership with store.delivery.perform + order.riderId. */
export const riderRouter = Router();
riderRouter.use(requireAuth);
const params = z.object({ orderId: objectIdSchema });

riderRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.riderMe(req.user!.id) });
  }),
);

riderRouter.get(
  '/cod',
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.riderCod(req.user!.id) });
  }),
);

riderRouter.get(
  '/deliveries',
  validate({ query: riderDeliveryListQuerySchema }),
  asyncHandler(async (req, res) => {
    const { items, nextCursor } = await svc.listRiderDeliveries(req.user!.id, req.query as unknown as RiderDeliveryListQuery);
    res.json({ data: items, meta: { nextCursor } });
  }),
);

riderRouter.get(
  '/deliveries/:orderId',
  validate({ params }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.getRiderDelivery(req.user!.id, req.params.orderId!) });
  }),
);

riderRouter.post(
  '/deliveries/:orderId/start',
  validate({ params }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.startDelivery(req, req.params.orderId!) });
  }),
);

riderRouter.post(
  '/deliveries/:orderId/location',
  validate({ params, body: riderLocationSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.recordLocation(req.user!.id, req.params.orderId!, req.body as RiderLocationInput) });
  }),
);

riderRouter.post(
  '/uploads',
  asyncHandler(async (req, res) => {
    // Only riders may upload proof-of-delivery photos.
    await svc.riderMe(req.user!.id);
    await new Promise<void>((resolve, reject) => singleImage(req, res, (err?: unknown) => (err ? reject(err) : resolve())));
    const img = await storeUploadedImage(req, `delivery/${req.user!.id}`, 'delivery');
    await audit({ action: 'upload.delivery_photo', req, targetType: 'User', targetId: req.user!.id, meta: { key: img.key } });
    res.status(201).json({ data: img });
  }),
);

riderRouter.post(
  '/deliveries/:orderId/deliver',
  validate({ params, body: deliverSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as DeliverInput;
    const photo = body.photoRef ? openUploadRef(body.photoRef, req.user!.id, 'delivery') : undefined;
    res.json({ data: await svc.deliverOrder(req, req.params.orderId!, body, photo) });
  }),
);

riderRouter.post(
  '/deliveries/:orderId/fail',
  validate({ params, body: deliveryFailSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await svc.failDelivery(req, req.params.orderId!, req.body as { reason: DeliveryFailReason; note?: string }) });
  }),
);
