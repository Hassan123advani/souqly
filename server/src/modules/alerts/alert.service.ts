import { formatMoney, type AlertDTO, type AlertType } from '@souqly/shared';
import { Types } from 'mongoose';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { getJobs } from '../../services/jobs';
import { Product, type ProductLean } from '../catalog/product.model';
import { notifySafe } from '../chat/notifyAdapter';
import { ProductAlert, type ProductAlertLean } from './alert.model';

const oid = (s: string | Types.ObjectId) => new Types.ObjectId(String(s));
const MAX_ALERTS = 200;

/** Current price + sellable stock for a product or one of its variants. */
function snapshot(p: ProductLean, variantId?: Types.ObjectId | string | null): { price: number; stock: number } | null {
  if (variantId) {
    const v = p.variants.find((x) => String(x._id) === String(variantId));
    if (!v) return null;
    return { price: v.price, stock: v.isActive ? Math.max(0, v.stock - (v.reserved ?? 0)) : 0 };
  }
  return { price: p.priceMin, stock: p.totalStock };
}

const toDTO = (a: ProductAlertLean): AlertDTO => ({
  id: String(a._id),
  productId: String(a.productId),
  ...(a.variantId ? { variantId: String(a.variantId) } : {}),
  type: a.type,
  targetPrice: a.targetPrice,
  createdAt: a.createdAt.toISOString(),
});

export async function listAlerts(userId: string): Promise<AlertDTO[]> {
  const rows = await ProductAlert.find({ userId: oid(userId), active: true }).sort({ _id: -1 }).limit(MAX_ALERTS).lean<ProductAlertLean[]>();
  return rows.map(toDTO);
}

export async function subscribe(userId: string, input: { productId: string; variantId?: string; type: AlertType }): Promise<AlertDTO> {
  const p = await Product.findOne({ _id: oid(input.productId), status: 'published', deletedAt: { $exists: false } }).lean<ProductLean>();
  if (!p) throw new AppError(404, 'NOT_FOUND', 'Product not found');
  const snap = snapshot(p, input.variantId);
  if (!snap) throw new AppError(400, 'INVALID_VARIANT', 'Variant not found');
  if (input.type === 'back_in_stock' && snap.stock > 0) throw new AppError(400, 'IN_STOCK', 'This item is in stock');
  if ((await ProductAlert.countDocuments({ userId: oid(userId), active: true })) >= MAX_ALERTS) throw new AppError(400, 'ALERT_LIMIT', 'You have too many alerts');
  const a = await ProductAlert.findOneAndUpdate(
    { userId: oid(userId), productId: p._id, variantId: input.variantId ? oid(input.variantId) : null, type: input.type },
    { $set: { active: true, targetPrice: snap.price }, $unset: { notifiedAt: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean<ProductAlertLean>();
  return toDTO(a!);
}

export async function unsubscribe(userId: string, input: { productId: string; variantId?: string; type: AlertType }): Promise<void> {
  await ProductAlert.deleteOne({ userId: oid(userId), productId: oid(input.productId), variantId: input.variantId ? oid(input.variantId) : null, type: input.type });
}

/** Evaluates the active alerts of one product; returns how many notifications were sent. Never throws. */
export async function checkProductAlerts(productId: string | Types.ObjectId): Promise<number> {
  try {
    const alerts = await ProductAlert.find({ productId: oid(productId), active: true }).lean<ProductAlertLean[]>();
    if (!alerts.length) return 0;
    const p = await Product.findById(oid(productId)).lean<ProductLean>();
    if (!p || p.status !== 'published' || p.deletedAt) return 0;
    let sent = 0;
    for (const a of alerts) {
      const snap = snapshot(p, a.variantId);
      if (!snap) continue;
      if (a.type === 'price_drop' && snap.price < a.targetPrice && snap.stock > 0) {
        // Re-arm at the new price so a further drop notifies again.
        const claimed = await ProductAlert.updateOne({ _id: a._id, targetPrice: a.targetPrice }, { $set: { targetPrice: snap.price, notifiedAt: new Date() } });
        if (claimed.modifiedCount !== 1) continue;
        await notifySafe({
          userId: String(a.userId),
          type: 'alert.price_drop',
          title: 'Price drop',
          body: `${p.title} is now ${formatMoney(snap.price)} (was ${formatMoney(a.targetPrice)}).`,
          link: `/p/${p.slug}`,
          data: { productId: String(p._id) },
        });
        sent++;
      } else if (a.type === 'back_in_stock' && snap.stock > 0) {
        const claimed = await ProductAlert.updateOne({ _id: a._id, active: true }, { $set: { active: false, notifiedAt: new Date() } });
        if (claimed.modifiedCount !== 1) continue;
        await notifySafe({ userId: String(a.userId), type: 'alert.back_in_stock', title: 'Back in stock', body: `${p.title} is back in stock.`, link: `/p/${p.slug}`, data: { productId: String(p._id) } });
        sent++;
      }
    }
    return sent;
  } catch (err) {
    logger.warn({ err }, 'Product alert check failed');
    return 0;
  }
}

/** Periodic sweep over every product with active alerts (catches stock changes from inventory/returns). */
export async function sweepAlerts(): Promise<number> {
  const ids = (await ProductAlert.distinct('productId', { active: true })) as Types.ObjectId[];
  let sent = 0;
  for (const id of ids) sent += await checkProductAlerts(id);
  return sent;
}

let started = false;
export function startAlertJobs(): void {
  if (started) return;
  started = true;
  getJobs().every('alerts.sweep', 10 * 60_000, async () => {
    const n = await sweepAlerts();
    if (n) logger.info({ sent: n }, 'Product alerts sent');
  });
}
