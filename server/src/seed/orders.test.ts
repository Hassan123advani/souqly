import { ORDER_STATUSES, canTransition } from '@souqly/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { setStorage, type StorageService } from '../services/storage';
import { api, loginAgent } from '../test/helpers';
import { Checkout } from '../modules/checkout/checkout.model';
import { CommissionRule } from '../modules/commission/commission.model';
import { Order } from '../modules/orders/order.model';
import { Voucher } from '../modules/vouchers/voucher.model';
import { DEMO_PASSWORD, runSeed } from './seed';
import { seedOrders } from './orders';

const memory: StorageService = {
  name: 'local',
  async upload(_b, opts) {
    return { url: `/uploads/${opts.folder}/${opts.filename}`, key: `${opts.folder}/${opts.filename}` };
  },
  async delete() {},
};

beforeAll(async () => {
  setStorage(memory);
  await runSeed({ production: false });
}, 120_000);

describe('Phase 6 seed', () => {
  it('creates vouchers and commission rules', async () => {
    expect(await Voucher.countDocuments({ scope: 'platform', code: { $in: ['SOUQLY10', 'FREESHIP'] } })).toBe(2);
    expect(await Voucher.countDocuments({ scope: 'store' })).toBeGreaterThanOrEqual(1);
    expect(await CommissionRule.findOne({ scope: 'global' }).lean()).toMatchObject({ bps: 1000 });
    expect(await CommissionRule.findOne({ scope: 'category' }).lean()).toMatchObject({ bps: 600 });
  });

  it('creates demo orders in every status with consistent timelines and checkouts', async () => {
    const orders = await Order.find({ demo: true }).lean();
    expect(new Set(orders.map((o) => o.status))).toEqual(new Set(ORDER_STATUSES));
    expect(new Set(orders.map((o) => String(o.storeId))).size).toBeGreaterThanOrEqual(3);
    for (const o of orders) {
      expect(o.timeline.at(-1)!.status).toBe(o.status);
      for (let i = 1; i < o.timeline.length; i++) {
        expect(canTransition(o.timeline[i - 1]!.status, o.timeline[i]!.status)).toBe(true);
        expect(o.timeline[i]!.at.getTime()).toBeGreaterThan(o.timeline[i - 1]!.at.getTime());
      }
      expect(o.total).toBe(o.subtotal + o.shippingFee - o.discounts.store - o.discounts.platform);
    }
    const checkouts = await Checkout.find({ demo: true }).lean();
    expect(checkouts.some((c) => c.orderIds.length === 2)).toBe(true);
  });

  it('is idempotent and visible to the demo buyer (with OTP on shipped orders)', async () => {
    const before = await Order.countDocuments({ demo: true });
    expect((await seedOrders()).orders).toBe(0);
    expect(await Order.countDocuments({ demo: true })).toBe(before);

    const { agent } = await loginAgent('ayesha@demo.souqly.pk', DEMO_PASSWORD);
    const list = await agent.get(api('/orders?limit=50'));
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThan(0);
    const shipped = await Order.findOne({ demo: true, status: { $in: ['shipped', 'out_for_delivery'] } }).populate<{ buyerId: { email: string } }>('buyerId', 'email').lean();
    const owner = await loginAgent(shipped!.buyerId.email, DEMO_PASSWORD);
    const detail = await owner.agent.get(api(`/orders/${shipped!.number}`));
    expect(detail.body.data.deliveryOtp).toMatch(/^\d{4}$/);
  });
});
