import { PERMISSIONS, adminCampaignSchema, adminFlashSaleSchema, adminVoucherSchema, objectIdSchema } from '@souqly/shared';
import { Router } from 'express';
import type { Model } from 'mongoose';
import { z, type ZodTypeAny } from 'zod';
import { AppError, notFound } from '../../lib/AppError';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate';
import { audit } from '../audit/audit.service';
import { invalidateFlashCache } from '../catalog/catalog.service';
import { invalidateHomeCache } from '../catalog/home.service';
import { Campaign, FlashSale } from '../catalog/marketing.models';
import { Product } from '../catalog/product.model';
import { Voucher } from '../vouchers/voucher.model';
import { withFlashItemNames } from './names';
import { can, oid } from './common';

export const adminMarketingRouter = Router();
const idParams = z.object({ id: objectIdSchema });
const MANAGE = PERMISSIONS.ADMIN_MARKETING_MANAGE;

type Resource = {
  path: string;
  model: Model<Record<string, unknown>>;
  schema: ZodTypeAny;
  /** Partial-update schema (ZodEffects from .refine() cannot be .partial()-ed, so updates re-validate the merged doc). */
  name: string;
  baseFilter: Record<string, unknown>;
  prepare?: (body: Record<string, unknown>) => Promise<Record<string, unknown>>;
  after?: () => void;
};

async function checkFlashItems(body: Record<string, unknown>) {
  const items = (body.items as { productId: string; variantId?: string; flashPrice: number }[]) ?? [];
  const products = await Product.find({ _id: { $in: items.map((i) => oid(i.productId)) } }).select('variants._id variants.price').lean();
  for (const it of items) {
    const p = products.find((x) => String(x._id) === it.productId);
    if (!p) throw new AppError(400, 'PRODUCT_NOT_FOUND', 'A flash sale product does not exist', { productId: it.productId });
    const variants = it.variantId ? p.variants.filter((v) => String(v._id) === it.variantId) : p.variants;
    if (!variants.length) throw new AppError(400, 'VARIANT_NOT_FOUND', 'A flash sale variant does not exist', { productId: it.productId });
    if (variants.some((v) => it.flashPrice >= v.price)) throw new AppError(400, 'FLASH_PRICE_TOO_HIGH', 'The flash price must be below the regular price', { productId: it.productId });
  }
  return { ...body, items: items.map((i) => ({ ...i, sold: 0 })) };
}

const resources: Resource[] = [
  { path: 'campaigns', model: Campaign as unknown as Model<Record<string, unknown>>, schema: adminCampaignSchema, name: 'campaign', baseFilter: {}, after: invalidateHomeCache },
  { path: 'flash-sales', model: FlashSale as unknown as Model<Record<string, unknown>>, schema: adminFlashSaleSchema, name: 'flash_sale', baseFilter: {}, prepare: checkFlashItems, after: () => { invalidateFlashCache(); invalidateHomeCache(); } },
  { path: 'vouchers', model: Voucher as unknown as Model<Record<string, unknown>>, schema: adminVoucherSchema, name: 'voucher', baseFilter: { scope: 'platform', storeId: null }, prepare: async (b) => ({ ...b, scope: 'platform', storeId: null }) },
];

const listQuery = z.object({ active: z.enum(['true', 'false']).optional(), limit: z.coerce.number().int().min(1).max(200).default(100) });

for (const r of resources) {
  const toDTO = (d: Record<string, unknown>) => {
    const { _id, __v, ...rest } = d;
    void __v;
    return { id: String(_id), ...rest };
  };
  const write = async (body: Record<string, unknown>) => (r.prepare ? r.prepare(body) : body);

  adminMarketingRouter.get(
    `/${r.path}`,
    ...can(MANAGE),
    validate({ query: listQuery }),
    asyncHandler(async (req, res) => {
      const f = req.query as unknown as z.infer<typeof listQuery>;
      const now = new Date();
      const filter = { ...r.baseFilter, ...(f.active === 'true' ? { startsAt: { $lte: now }, endsAt: { $gte: now } } : f.active === 'false' ? { $or: [{ startsAt: { $gt: now } }, { endsAt: { $lt: now } }] } : {}) };
      const rows = (await r.model.find(filter).sort({ startsAt: -1 }).limit(f.limit).lean()) as Record<string, unknown>[];
      const dtos = rows.map(toDTO);
      res.json({ data: r.path === 'flash-sales' ? await withFlashItemNames(dtos as { items?: { productId: unknown }[] }[]) : dtos });
    }),
  );

  adminMarketingRouter.get(
    `/${r.path}/:id`,
    ...can(MANAGE),
    validate({ params: idParams }),
    asyncHandler(async (req, res) => {
      const d = (await r.model.findOne({ _id: oid(req.params.id!), ...r.baseFilter }).lean()) as Record<string, unknown> | null;
      if (!d) throw notFound(r.name);
      res.json({ data: r.path === 'flash-sales' ? (await withFlashItemNames([toDTO(d) as { items?: { productId: unknown }[] }]))[0] : toDTO(d) });
    }),
  );

  adminMarketingRouter.post(
    `/${r.path}`,
    ...can(MANAGE),
    validate({ body: r.schema }),
    asyncHandler(async (req, res) => {
      const doc = (await r.model.create(await write(req.body))) as unknown as { _id: unknown; toObject(): Record<string, unknown> };
      r.after?.();
      await audit({ action: `admin.${r.name}_created`, targetType: r.name, targetId: String(doc._id), req });
      res.status(201).json({ data: toDTO(doc.toObject()) });
    }),
  );

  /** Full replace (PUT): the client sends the whole object, validated by the same schema as create. */
  adminMarketingRouter.put(
    `/${r.path}/:id`,
    ...can(MANAGE),
    validate({ params: idParams, body: r.schema }),
    asyncHandler(async (req, res) => {
      const body = await write(req.body);
      if (r.path === 'flash-sales') {
        // Keep sold counters of items that stay in the sale.
        const prev = (await FlashSale.findById(req.params.id).lean())?.items ?? [];
        body.items = (body.items as { productId: string; variantId?: string; sold: number }[]).map((i) => ({
          ...i,
          sold: prev.find((p) => String(p.productId) === i.productId && String(p.variantId ?? '') === String(i.variantId ?? ''))?.sold ?? 0,
        }));
      }
      const d = (await r.model.findOneAndUpdate({ _id: oid(req.params.id!), ...r.baseFilter }, { $set: body }, { new: true, runValidators: true }).lean()) as Record<string, unknown> | null;
      if (!d) throw notFound(r.name);
      r.after?.();
      await audit({ action: `admin.${r.name}_updated`, targetType: r.name, targetId: req.params.id!, req });
      res.json({ data: toDTO(d) });
    }),
  );

  adminMarketingRouter.delete(
    `/${r.path}/:id`,
    ...can(MANAGE),
    validate({ params: idParams }),
    asyncHandler(async (req, res) => {
      const out = await r.model.deleteOne({ _id: oid(req.params.id!), ...r.baseFilter });
      if (!out.deletedCount) throw notFound(r.name);
      r.after?.();
      await audit({ action: `admin.${r.name}_deleted`, targetType: r.name, targetId: req.params.id!, req });
      res.status(204).end();
    }),
  );
}
