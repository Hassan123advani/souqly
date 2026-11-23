import { PERMISSIONS, formatMoney, type SellerRiderDTO } from '@souqly/shared';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../../lib/AppError';
import { resolveMemberPermissions } from '../../middleware/storeContext';
import { audit } from '../audit/audit.service';
import { notify } from '../notifications/notification.service';
import { Order } from '../orders/order.model';
import type { StoreDoc } from '../stores/store.model';
import { StoreMember } from '../stores/storeMember.model';
import { User } from '../users/user.model';
import { DEFAULT_RIDER_FEE, DeliverySession, DeliverySettings, RiderCashEntry } from './delivery.model';
import { cashBalances } from './rider.service';

async function storeRiders(storeId: Types.ObjectId) {
  const members = await StoreMember.find({ storeId, status: 'active' });
  const out = [];
  for (const m of members) if ((await resolveMemberPermissions(m)).includes(PERMISSIONS.STORE_DELIVERY_PERFORM)) out.push(m);
  return out;
}

export async function listStoreRiders(store: StoreDoc): Promise<SellerRiderDTO[]> {
  const riders = await storeRiders(store._id);
  const ids = riders.map((r) => r.userId);
  const [users, active, delivered] = await Promise.all([
    User.find({ _id: { $in: ids } }).select('name phone').lean(),
    Order.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { storeId: store._id, riderId: { $in: ids }, status: { $in: ['shipped', 'out_for_delivery'] } } }, { $group: { _id: '$riderId', n: { $sum: 1 } } }]),
    DeliverySession.aggregate<{ _id: Types.ObjectId; n: number; earn: number }>([
      { $match: { storeId: store._id, riderId: { $in: ids }, status: 'delivered' } },
      { $group: { _id: '$riderId', n: { $sum: 1 }, earn: { $sum: '$earning' } } },
    ]),
  ]);
  const out: SellerRiderDTO[] = [];
  for (const m of riders) {
    const u = users.find((x) => String(x._id) === String(m.userId));
    const [bal] = await cashBalances(m.userId, [store._id]);
    const d = delivered.find((x) => String(x._id) === String(m.userId));
    out.push({
      memberId: String(m._id),
      user: { id: String(m.userId), name: u?.name ?? '', ...(u?.phone ? { phone: u.phone } : {}) },
      role: m.role,
      activeDeliveries: active.find((x) => String(x._id) === String(m.userId))?.n ?? 0,
      deliveredTotal: d?.n ?? 0,
      codOutstanding: bal?.outstanding ?? 0,
      earnings: d?.earn ?? 0,
    });
  }
  return out;
}

/** Records cash handed over by a rider to the store. Amount must not exceed what the rider holds. */
export async function settleCod(req: Request, memberId: string, amount: number) {
  const store = req.store!;
  const member = await StoreMember.findOne({ _id: new Types.ObjectId(memberId), storeId: store._id });
  if (!member) throw new AppError(404, 'NOT_FOUND', 'Rider not found');
  const [bal] = await cashBalances(member.userId, [store._id]);
  const outstanding = bal?.outstanding ?? 0;
  if (amount > outstanding) throw new AppError(400, 'AMOUNT_EXCEEDS_OUTSTANDING', 'Amount is more than the cash this rider holds', { outstanding });
  await RiderCashEntry.create({ storeId: store._id, riderId: member.userId, type: 'settled', amount, by: new Types.ObjectId(req.user!.id) });
  await audit({ action: 'rider.cod_settled', req, targetType: 'StoreMember', targetId: member._id, meta: { riderUserId: String(member.userId), amount } });
  void notify({ userId: member.userId, type: 'rider.cod_settled', title: 'Cash settled', body: `${store.name} recorded ${formatMoney(amount)} cash received from you.`, link: '/rider/cod' });
  return { outstanding: outstanding - amount };
}

export async function getRiderSettings(store: StoreDoc) {
  const s = await DeliverySettings.findOne({ storeId: store._id }).lean();
  return { riderFee: s?.riderFee ?? DEFAULT_RIDER_FEE };
}

export async function updateRiderSettings(req: Request, riderFee: number) {
  const store = req.store!;
  await DeliverySettings.findOneAndUpdate({ storeId: store._id }, { $set: { riderFee } }, { upsert: true });
  await audit({ action: 'store.rider_settings_updated', req, targetType: 'Store', targetId: store._id, meta: { riderFee } });
  return { riderFee };
}
