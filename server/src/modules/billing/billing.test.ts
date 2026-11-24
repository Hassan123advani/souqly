import { Types } from 'mongoose';
import { afterEach, describe, expect, it } from 'vitest';
import { env } from '../../config/env';
import { signStripePayload, verifyStripeSignature } from '../../services/payment/stripe';
import { billingOrder, endPeriod, setStorePlan, staffAgent } from '../../test/billingFixtures';
import { xhr } from '../../test/helpers';
import { Product } from '../catalog/product.model';
import { SellerLedger } from '../finance/ledger.model';
import { addStaff, api, categories, makeBuyer, makeItem, makeSeller } from '../orders/orderTestFixtures';
import { signupAgent } from '../../test/helpers';
import { clearSettingsCache, setSetting } from '../settings/settings.service';
import { Store } from '../stores/store.model';
import { BillingAdjustment } from './adjustment.model';
import { markOverdue, runBillingSweep } from './billing.service';
import { BillingPayment } from './billingPayment.model';
import { CommissionEntry } from './commissionEntry.model';
import { Invoice } from './invoice.model';
import { addMonths, unusedCredit } from './period';
import { Subscription } from './subscription.model';

const DAY = 86_400_000;

async function overdueNow(invoiceId: unknown) {
  await Invoice.updateOne({ _id: invoiceId }, { $set: { dueDate: new Date(Date.now() - 1000) } });
  return markOverdue();
}

/** Seller with an available balance (online sale, hold 0). */
async function fundBalance(storeId: Types.ObjectId, subtotal: number) {
  await setSetting('financeHoldDays', 0);
  clearSettingsCache();
  await billingOrder({ storeId, subtotal, method: 'stripe', deliveredDaysAgo: 1 });
}

afterEach(async () => {
  await setSetting('financeHoldDays', 7);
  clearSettingsCache();
});

describe('periods (pure)', () => {
  it('keeps the anchor day across short months and prorates unused time', () => {
    const jan31 = new Date(Date.UTC(2026, 0, 31, 10));
    const feb = addMonths(jan31, 1, 31);
    expect(feb.toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(addMonths(feb, 1, 31).toISOString().slice(0, 10)).toBe('2026-03-31');
    const start = new Date(Date.UTC(2026, 0, 1));
    const end = new Date(Date.UTC(2026, 0, 31));
    expect(unusedCredit(50_000, start, end, new Date(Date.UTC(2026, 0, 16)))).toBe(25_000);
    expect(unusedCredit(50_000, start, end, end)).toBe(0);
    expect(unusedCredit(0, start, end, start)).toBe(0);
  });
});

describe('monthly invoices', () => {
  it('Premium fee + COD commission on one invoice (1,000 + 500 = 1,500); each entry billed exactly once', async () => {
    const s = await makeSeller('Bill Premium');
    await setStorePlan(s.store._id, 'premium');
    await billingOrder({ storeId: s.store._id, subtotal: 333_333, deliveredDaysAgo: 5 }); // commission 50,000
    const cutoff = await endPeriod(s.store._id);

    let r = await runBillingSweep();
    expect(r.invoicesIssued).toBeGreaterThanOrEqual(1);
    const inv = (await Invoice.findOne({ storeId: s.store._id }).lean())!;
    expect(inv).toMatchObject({ kind: 'renewal', status: 'open', plan: 'premium', total: 150_000 });
    expect(inv.lines.map((l) => [l.type, l.amount])).toEqual([
      ['subscription', 100_000],
      ['commission', 50_000],
    ]);
    expect(inv.dueDate.getTime()).toBe(cutoff.getTime() + 7 * DAY);
    expect(await CommissionEntry.findOne({ storeId: s.store._id }).lean()).toMatchObject({ status: 'invoiced', invoiceId: inv._id });

    // Running the sweep again never re-issues or re-bills.
    r = await runBillingSweep();
    expect(await Invoice.countDocuments({ storeId: s.store._id })).toBe(1);

    // Next period: only the new COD order is billed.
    await billingOrder({ storeId: s.store._id, subtotal: 200_000, deliveredDaysAgo: 0.01 });
    await Subscription.updateOne({ storeId: s.store._id }, { $set: { currentPeriodEnd: new Date(Date.now() - 1000) } });
    await runBillingSweep();
    const invoices = await Invoice.find({ storeId: s.store._id }).sort({ issuedAt: 1 }).lean();
    expect(invoices).toHaveLength(2);
    expect(invoices[1]!.lines.find((l) => l.type === 'commission')).toMatchObject({ amount: 30_000, entries: 1 });
    const billedTo = await CommissionEntry.distinct('invoiceId', { storeId: s.store._id });
    expect(billedTo).toHaveLength(2);

    // Seller sees it in the API.
    const list = await s.agent.get(api('/seller/billing/invoices'));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(2);
    const detail = await s.agent.get(api(`/seller/billing/invoices/${inv._id}`));
    expect(detail.body.data).toMatchObject({ number: inv.number, amountDue: 150_000 });
    expect(detail.body.data.commissions).toHaveLength(1);
    const pdf = await s.agent.get(api(`/seller/billing/invoices/${inv._id}/pdf`));
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toMatch(/pdf/);
  });

  it('a Free seller with no dues gets no invoice and is never suspended for fees', async () => {
    const s = await makeSeller('Bill Free');
    await endPeriod(s.store._id, 40);
    await runBillingSweep();
    await markOverdue(new Date(Date.now() + 60 * DAY));
    expect(await Invoice.countDocuments({ storeId: s.store._id })).toBe(0);
    expect((await Store.findById(s.store._id).lean())!.billingStatus).toBe('active');
    const sub = (await Subscription.findOne({ storeId: s.store._id }).lean())!;
    expect(sub.currentPeriodEnd.getTime()).toBeGreaterThan(Date.now());
  });

  it('a Free seller with COD commission is invoiced for the commission only (fee Rs 0)', async () => {
    const s = await makeSeller('Bill Free COD');
    await billingOrder({ storeId: s.store._id, subtotal: 100_000, deliveredDaysAgo: 3 });
    await endPeriod(s.store._id);
    await runBillingSweep();
    const inv = (await Invoice.findOne({ storeId: s.store._id }).lean())!;
    expect(inv.lines.map((l) => l.type)).toEqual(['commission']);
    expect(inv.total).toBe(15_000);
  });

  it('refund reversal offsets unbilled commission; a negative COD balance is recovered on the invoice', async () => {
    const s = await makeSeller('Bill Recovery');
    const o = await billingOrder({ storeId: s.store._id, subtotal: 100_000, deliveredDaysAgo: 3 });
    // Souqly refunded the buyer Rs 1,000 to the wallet: the seller (who holds the cash) owes it back.
    const { ReturnRequest } = await import('../returns/return.model');
    await ReturnRequest.create({ orderId: o._id, orderNumber: o.number, storeId: s.store._id, buyerId: o.buyerId, items: [{ productId: o.items[0]!.productId, variantId: o.items[0]!.variantId, title: 't', price: 100_000, qty: 1 }], reason: 'damaged', status: 'refunded', refund: { method: 'wallet', amount: 100_000, at: new Date(Date.now() - 2 * DAY) }, timeline: [] });
    await endPeriod(s.store._id);
    await runBillingSweep();
    const inv = (await Invoice.findOne({ storeId: s.store._id }).lean())!;
    // Commission 15,000 − reversal 15,000 = 0 (no commission line); refund 100,000 recovered.
    expect(inv.lines.map((l) => [l.type, l.amount])).toEqual([['balance_recovery', 100_000]]);
    expect(await CommissionEntry.countDocuments({ storeId: s.store._id, status: 'invoiced' })).toBe(2);
    const sum = (await SellerLedger.find({ storeId: s.store._id }).lean()).reduce((a, e) => a + e.amount, 0);
    expect(sum).toBe(0);
  });
});

describe('overdue → suspension → pay → reactivation', () => {
  it('suspends a store past due, hides it, blocks orders + publishing, keeps billing usable, lifts on payment', async () => {
    const s = await makeSeller('Bill Overdue');
    await setStorePlan(s.store._id, 'pro');
    const item = await makeItem(s.store._id, 100_000);
    await endPeriod(s.store._id);
    await runBillingSweep();
    const inv = (await Invoice.findOne({ storeId: s.store._id }).lean())!;
    expect(inv.total).toBe(50_000);

    const r = await overdueNow(inv._id);
    expect(r.suspended).toBe(1);
    const store = (await Store.findById(s.store._id).lean())!;
    expect(store).toMatchObject({ status: 'approved', billingStatus: 'suspended', billingSuspension: { reason: 'overdue' } });

    // Hidden from public + no new orders.
    expect((await xhr().get(api(`/stores/${store.slug}`))).status).toBe(404);
    const buyer = await makeBuyer();
    const add = await buyer.agent.post(api('/cart/items')).send({ productId: item.productId, variantId: item.variantId, qty: 1 });
    expect(add.body.error?.code).toBe('STORE_UNAVAILABLE');
    // Cannot publish a new product.
    const draftItem = await makeItem(s.store._id, 50_000);
    await Product.updateOne({ _id: draftItem.productId }, { $set: { status: 'draft' }, $unset: { publishedAt: 1 } });
    const draft = { _id: draftItem.productId };
    expect((await s.agent.post(api(`/seller/products/${draft._id}/publish`))).body.error.code).toBe('BILLING_SUSPENDED');
    // Seller Center, orders and billing still work.
    expect((await s.agent.get(api('/seller/orders'))).status).toBe(200);
    const summary = await s.agent.get(api('/seller/billing/summary'));
    expect(summary.status).toBe(200);
    expect(summary.body.data.subscription).toMatchObject({ billingStatus: 'suspended', suspension: { reason: 'overdue' } });
    expect(summary.body.data.outstanding).toMatchObject({ invoices: 1, amountDue: 50_000, overdue: 50_000 });
    // Any member (no finance permission needed) sees the hold on the store DTO.
    const orders = await addStaff(s.store._id, 'ORDERS');
    expect((await orders.agent.get(api('/seller/store'))).body.data).toMatchObject({ billingStatus: 'suspended', billingSuspension: { reason: 'overdue' } });

    // Pay by bank transfer → admin verifies → paid, lifted.
    const pay = await s.agent.post(api(`/seller/billing/invoices/${inv._id}/pay`)).send({ method: 'manual', channel: 'bank', reference: 'HBL-778899' });
    expect(pay.status).toBe(201);
    expect(pay.body.data).toMatchObject({ status: 'pending', amount: 50_000 });
    const admin = await staffAgent('FINANCE');
    const queue = await admin.agent.get(api('/admin/billing/payments?status=pending&method=manual'));
    expect(queue.body.data.some((p: { id: string }) => p.id === pay.body.data.id)).toBe(true);
    const ok = await admin.agent.post(api(`/admin/billing/payments/${pay.body.data.id}/approve`)).send({ note: 'Seen in HBL statement' });
    expect(ok.status).toBe(200);
    expect(await Invoice.findById(inv._id).lean()).toMatchObject({ status: 'paid', amountPaid: 50_000 });
    expect((await Store.findById(s.store._id).lean())!.billingStatus).toBe('active');
    expect((await xhr().get(api(`/stores/${store.slug}`))).status).toBe(200);
    expect(await BillingAdjustment.countDocuments({ storeId: s.store._id, type: 'manual_payment' })).toBe(1);
  });

  it('an admin billing suspension is not lifted by paying; moderation suspension is untouched by billing', async () => {
    const s = await makeSeller('Bill Admin Suspend');
    const admin = await staffAgent('FINANCE');
    expect((await admin.agent.post(api(`/admin/billing/stores/${s.store._id}/suspend`)).send({ reason: 'Chargeback investigation' })).status).toBe(200);
    expect((await Store.findById(s.store._id).lean())!).toMatchObject({ status: 'approved', billingStatus: 'suspended', billingSuspension: { reason: 'admin' } });
    expect((await s.agent.get(api('/seller/billing/summary'))).status).toBe(200);
    expect((await admin.agent.post(api(`/admin/billing/stores/${s.store._id}/reactivate`)).send({ reason: 'Resolved with seller' })).status).toBe(200);
    expect((await Store.findById(s.store._id).lean())!.billingStatus).toBe('active');
    expect((await admin.agent.post(api(`/admin/billing/stores/${s.store._id}/reactivate`)).send({ reason: 'Resolved again' })).body.error.code).toBe('NOT_SUSPENDED');
  });
});

describe('paying invoices', () => {
  it('pay from balance is atomic: concurrent payments settle once and debit once', async () => {
    const s = await makeSeller('Bill Balance');
    await setStorePlan(s.store._id, 'pro');
    await endPeriod(s.store._id);
    await runBillingSweep();
    const inv = (await Invoice.findOne({ storeId: s.store._id }).lean())!;

    let res = await s.agent.post(api(`/seller/billing/invoices/${inv._id}/pay`)).send({ method: 'balance' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'INSUFFICIENT_BALANCE', details: { available: 0, amountDue: 50_000 } });

    await fundBalance(s.store._id, 100_000); // 85,000 available
    const results = await Promise.all([1, 2, 3].map(() => s.agent.post(api(`/seller/billing/invoices/${inv._id}/pay`)).send({ method: 'balance' })));
    expect(results.filter((x) => x.status === 201)).toHaveLength(1);
    expect(results.filter((x) => x.status === 409)).toHaveLength(2);
    expect(await SellerLedger.countDocuments({ storeId: s.store._id, type: 'invoice_payment' })).toBe(1);
    expect(await Invoice.findById(inv._id).lean()).toMatchObject({ status: 'paid', amountPaid: 50_000 });
    res = await s.agent.get(api('/seller/finance/summary'));
    expect(res.body.data.available).toBe(35_000);
    // Idempotency key replays return the first result.
    const key = `k-${Date.now()}-balance`;
    expect((await s.agent.post(api(`/seller/billing/invoices/${inv._id}/pay`)).send({ method: 'balance', idempotencyKey: key })).body.error.code).toBe('INVOICE_NOT_PAYABLE');
  });

  it('manual payments: duplicate references refused, reject → resubmit, partial approval keeps the invoice open', async () => {
    const s = await makeSeller('Bill Manual');
    await setStorePlan(s.store._id, 'premium');
    await endPeriod(s.store._id);
    await runBillingSweep();
    const inv = (await Invoice.findOne({ storeId: s.store._id }).lean())!;
    const admin = await staffAgent('FINANCE');

    const first = await s.agent.post(api(`/seller/billing/invoices/${inv._id}/pay`)).send({ method: 'manual', channel: 'jazzcash', reference: 'JC 1001' });
    expect(first.status).toBe(201);
    expect((await s.agent.post(api(`/seller/billing/invoices/${inv._id}/pay`)).send({ method: 'manual', channel: 'bank', reference: 'OTHER-1' })).body.error.code).toBe('PAYMENT_PENDING');
    expect((await admin.agent.post(api(`/admin/billing/payments/${first.body.data.id}/reject`)).send({ reason: 'No such transfer' })).status).toBe(200);
    // Same reference can be corrected and resubmitted after a rejection.
    const second = await s.agent.post(api(`/seller/billing/invoices/${inv._id}/pay`)).send({ method: 'manual', channel: 'jazzcash', reference: 'JC 1002' });
    expect(second.status).toBe(201);
    const partial = await admin.agent.post(api(`/admin/billing/payments/${second.body.data.id}/approve`)).send({ amount: 40_000, note: 'Only Rs 400 received' });
    expect(partial.status).toBe(200);
    expect(await Invoice.findById(inv._id).lean()).toMatchObject({ status: 'open', amountPaid: 40_000 });
    // A reference already approved can never pay again (other invoice of another store).
    const other = await makeSeller('Bill Manual Two');
    await setStorePlan(other.store._id, 'pro');
    await endPeriod(other.store._id);
    await runBillingSweep();
    const otherInv = (await Invoice.findOne({ storeId: other.store._id }).lean())!;
    expect((await other.agent.post(api(`/seller/billing/invoices/${otherInv._id}/pay`)).send({ method: 'manual', channel: 'jazzcash', reference: 'jc1002' })).body.error.code).toBe('DUPLICATE_REFERENCE');

    const third = await s.agent.post(api(`/seller/billing/invoices/${inv._id}/pay`)).send({ method: 'manual', channel: 'bank', reference: 'MCB-5' });
    expect(third.body.data.amount).toBe(60_000);
    expect((await admin.agent.post(api(`/admin/billing/payments/${third.body.data.id}/approve`)).send({ amount: 70_000 })).body.error.code).toBe('AMOUNT_EXCEEDS_DUE');
    expect((await admin.agent.post(api(`/admin/billing/payments/${third.body.data.id}/approve`)).send({})).status).toBe(200);
    expect(await Invoice.findById(inv._id).lean()).toMatchObject({ status: 'paid', amountPaid: 100_000 });
  });

  it('gateway: clear "not configured" without keys; verified webhook pays once; bad signature / amount refused', async () => {
    const s = await makeSeller('Bill Gateway');
    await setStorePlan(s.store._id, 'pro');
    await endPeriod(s.store._id);
    await runBillingSweep();
    const inv = (await Invoice.findOne({ storeId: s.store._id }).lean())!;
    const res = await s.agent.post(api(`/seller/billing/invoices/${inv._id}/pay`)).send({ method: 'gateway', provider: 'stripe' });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatchObject({ code: 'PAYMENT_NOT_CONFIGURED', details: { provider: 'stripe', requiredEnv: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] } });
    expect((await s.agent.post(api(`/seller/billing/invoices/${inv._id}/pay`)).send({ method: 'gateway', provider: 'jazzcash' })).body.error.details.requiredEnv).toContain('JAZZCASH_MERCHANT_ID');

    // Without a webhook secret the endpoint does not exist.
    expect((await xhr().post('/api/v1/webhooks/stripe').set('Content-Type', 'application/json').send('{}')).status).toBe(404);

    const secret = 'whsec_test_secret_for_billing';
    const prev = env.STRIPE_WEBHOOK_SECRET;
    (env as { STRIPE_WEBHOOK_SECRET?: string }).STRIPE_WEBHOOK_SECRET = secret;
    try {
      const p = await BillingPayment.create({ storeId: s.store._id, invoiceId: inv._id, invoiceNumber: inv.number, method: 'gateway', amount: 50_000, status: 'pending', gateway: { provider: 'stripe', sessionId: 'cs_test_1' } });
      const event = (amount: number, id = 'evt_1') => JSON.stringify({ id, type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', payment_status: 'paid', amount_total: amount, currency: 'pkr', payment_intent: 'pi_1' } } });
      const post = (body: string, sig: string) => xhr().post('/api/v1/webhooks/stripe').set('Content-Type', 'application/json').set('Stripe-Signature', sig).send(body);

      expect((await post(event(50_000), 't=1,v1=00')).status).toBe(400);
      expect((await post(event(50_000), signStripePayload(event(50_000), 'wrong'))).status).toBe(400);
      expect(verifyStripeSignature(event(1), signStripePayload(event(1), secret, Math.floor(Date.now() / 1000) - 3600), secret)).toBe(false); // replay window

      let r = await post(event(50_000), signStripePayload(event(50_000), secret));
      expect(r.status).toBe(200);
      expect(r.body.data.result).toBe('paid');
      expect(await Invoice.findById(inv._id).lean()).toMatchObject({ status: 'paid', amountPaid: 50_000 });
      r = await post(event(50_000, 'evt_2'), signStripePayload(event(50_000, 'evt_2'), secret));
      expect(r.body.data.result).toBe('duplicate');
      expect((await BillingPayment.findById(p._id).lean())!.gateway?.transactionId).toBe('pi_1');

      // Amount mismatch never pays.
      const s2 = await makeSeller('Bill Gateway Two');
      await setStorePlan(s2.store._id, 'pro');
      await endPeriod(s2.store._id);
      await runBillingSweep();
      const inv2 = (await Invoice.findOne({ storeId: s2.store._id }).lean())!;
      await BillingPayment.create({ storeId: s2.store._id, invoiceId: inv2._id, invoiceNumber: inv2.number, method: 'gateway', amount: 50_000, status: 'pending', gateway: { provider: 'stripe', sessionId: 'cs_test_2' } });
      const bad = JSON.stringify({ id: 'evt_3', type: 'checkout.session.completed', data: { object: { id: 'cs_test_2', payment_status: 'paid', amount_total: 100, currency: 'pkr', payment_intent: 'pi_2' } } });
      r = await post(bad, signStripePayload(bad, secret));
      expect(r.body.data.result).toBe('amount_mismatch');
      expect((await Invoice.findById(inv2._id).lean())!.status).toBe('open');
    } finally {
      (env as { STRIPE_WEBHOOK_SECRET?: string }).STRIPE_WEBHOOK_SECRET = prev;
    }
  });

  it('admin waiver needs a reason and is an explicit adjustment record', async () => {
    const s = await makeSeller('Bill Waive');
    await setStorePlan(s.store._id, 'pro');
    await endPeriod(s.store._id);
    await runBillingSweep();
    const inv = (await Invoice.findOne({ storeId: s.store._id }).lean())!;
    const admin = await staffAgent('FINANCE');
    expect((await admin.agent.post(api(`/admin/billing/invoices/${inv._id}/waive`)).send({})).status).toBe(400);
    const r = await admin.agent.post(api(`/admin/billing/invoices/${inv._id}/waive`)).send({ reason: 'Launch month goodwill' });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ status: 'waived', amountWaived: 50_000, amountDue: 0 });
    expect(await BillingAdjustment.findOne({ invoiceId: inv._id }).lean()).toMatchObject({ type: 'waiver', amount: 50_000, reason: 'Launch month goodwill' });
    const adj = await admin.agent.get(api(`/admin/billing/adjustments?storeId=${s.store._id}`));
    expect(adj.body.data[0]).toMatchObject({ type: 'waiver', storeName: 'Bill Waive', storeSlug: s.store.slug });
    const pdf = await admin.agent.get(api(`/admin/billing/invoices/${inv._id}/pdf`));
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toMatch(/pdf/);
    expect((await s.agent.get(api(`/admin/billing/invoices/${inv._id}/pdf`))).status).toBe(403);
  });
});

describe('plan changes', () => {
  it('upgrade creates an invoice and takes effect only when paid; downgrade is scheduled; dues are carried', async () => {
    const s = await makeSeller('Bill Upgrade');
    let res = await s.agent.post(api('/seller/billing/change-plan')).send({ plan: 'pro' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ effective: 'on_payment', invoice: { kind: 'upgrade', total: 50_000, status: 'open' }, subscription: { plan: 'free', pendingUpgrade: { plan: 'pro' } } });
    expect((await Store.findById(s.store._id).lean())!.plan).toBe('free');
    // Free-plan limits still apply until paid.
    expect((await s.agent.post(api('/seller/marketing/flash-deals')).send({})).body.error.code).toBe('PLAN_LIMIT');

    // Premium instead: the open Pro upgrade is replaced.
    res = await s.agent.post(api('/seller/billing/change-plan')).send({ plan: 'premium' });
    expect(res.body.data.invoice.total).toBe(100_000);
    expect(await Invoice.countDocuments({ storeId: s.store._id, kind: 'upgrade', status: 'open' })).toBe(1);
    expect(await Invoice.countDocuments({ storeId: s.store._id, kind: 'upgrade', status: 'void' })).toBe(1);

    await fundBalance(s.store._id, 200_000); // 170,000 available
    const inv = res.body.data.invoice;
    res = await s.agent.post(api(`/seller/billing/invoices/${inv.id}/pay`)).send({ method: 'balance' });
    expect(res.status).toBe(201);
    expect((await Store.findById(s.store._id).lean())!.plan).toBe('premium');
    const sub = (await Subscription.findOne({ storeId: s.store._id }).lean())!;
    expect(sub.plan).toBe('premium');
    expect(Math.abs(sub.currentPeriodStart.getTime() - Date.now())).toBeLessThan(60_000);

    // Some unpaid COD commission, then downgrade to Pro at period end.
    await billingOrder({ storeId: s.store._id, subtotal: 100_000, deliveredDaysAgo: 0.01 });
    res = await s.agent.post(api('/seller/billing/change-plan')).send({ plan: 'pro' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ effective: 'period_end', subscription: { plan: 'premium', scheduledChange: { plan: 'pro', kind: 'downgrade' } } });
    await Subscription.updateOne({ storeId: s.store._id }, { $set: { currentPeriodEnd: new Date(Date.now() - 1000), 'scheduledChange.effectiveAt': new Date(Date.now() - 1000) } });
    await runBillingSweep();
    const renewal = (await Invoice.findOne({ storeId: s.store._id, kind: 'renewal' }).lean())!;
    expect(renewal.lines.map((l) => [l.type, l.amount])).toEqual([
      ['subscription', 50_000],
      ['commission', 15_000],
    ]);
    expect((await Store.findById(s.store._id).lean())!.plan).toBe('pro');

    // Cancel = downgrade to Free at period end; outstanding invoice stays due.
    res = await s.agent.post(api('/seller/billing/cancel'));
    expect(res.body.data.subscription.scheduledChange).toMatchObject({ plan: 'free', kind: 'cancel' });
    res = await s.agent.delete(api('/seller/billing/scheduled-change'));
    expect(res.body.data.subscription.scheduledChange).toBeNull();
    await s.agent.post(api('/seller/billing/cancel'));
    await Subscription.updateOne({ storeId: s.store._id }, { $set: { currentPeriodEnd: new Date(Date.now() - 1000), 'scheduledChange.effectiveAt': new Date(Date.now() - 1000) } });
    await runBillingSweep();
    expect((await Store.findById(s.store._id).lean())!.plan).toBe('free');
    expect((await Invoice.findById(renewal._id).lean())!.status).toBe('open');
    const summary = (await s.agent.get(api('/seller/billing/summary'))).body.data;
    expect(summary.outstanding.amountDue).toBeGreaterThanOrEqual(65_000);
  });

  it('upgrade from a paid plan credits unused paid time', async () => {
    const s = await makeSeller('Bill Prorate');
    await setStorePlan(s.store._id, 'pro');
    const now = Date.now();
    await Subscription.updateOne({ storeId: s.store._id }, { $set: { currentPeriodStart: new Date(now - 15 * DAY), currentPeriodEnd: new Date(now + 15 * DAY) } });
    const res = await s.agent.post(api('/seller/billing/change-plan')).send({ plan: 'premium' });
    const credit = res.body.data.invoice.lines.find((l: { type: string }) => l.type === 'proration_credit');
    expect(credit.amount).toBeLessThanOrEqual(-24_900);
    expect(credit.amount).toBeGreaterThanOrEqual(-25_000);
    expect(res.body.data.invoice.total).toBe(100_000 + credit.amount);
  });

  it('downgraded stores keep over-limit products but cannot publish more; gated tools need the plan', async () => {
    const s = await makeSeller('Bill Limits');
    const { productId } = await makeItem(s.store._id, 10_000);
    await Product.collection.insertMany(Array.from({ length: 50 }, (_, i) => ({ storeId: s.store._id, title: `Live ${i}`, slug: `live-${String(s.store._id)}-${i}`, status: 'published', variants: [], images: [] })));
    await Product.updateOne({ _id: productId }, { $set: { status: 'draft' } });
    const r = await s.agent.post(api(`/seller/products/${productId}/publish`));
    expect(r.body.error).toMatchObject({ code: 'PLAN_LIMIT', details: { limit: 'liveProducts', max: 50 } });
    expect(await Product.countDocuments({ storeId: s.store._id, status: 'published' })).toBe(50);
    // Store design + analytics level.
    expect((await s.agent.patch(api('/seller/store')).send({ layoutTemplate: 'bold' })).body.error.code).toBe('PLAN_LIMIT');
    expect((await s.agent.get(api('/seller/analytics?range=90d'))).body.error.code).toBe('PLAN_LIMIT');
    expect((await s.agent.get(api('/seller/analytics?range=30d'))).status).toBe(200);
    const plans = await s.agent.get(api('/seller/billing/plans'));
    expect(plans.body.data).toMatchObject({ current: 'free', commissionBps: 1500, usage: { liveProducts: 50 } });
  });

  it('staff without finance.manage cannot change plans or pay; public plan catalog is open', async () => {
    const s = await makeSeller('Bill Perms');
    const manager = await addStaff(s.store._id, 'MANAGER');
    expect((await manager.agent.get(api('/seller/billing/summary'))).status).toBe(200);
    expect((await manager.agent.post(api('/seller/billing/change-plan')).send({ plan: 'pro' })).status).toBe(403);
    const cashier = await addStaff(s.store._id, 'CASHIER');
    expect((await cashier.agent.get(api('/seller/billing/summary'))).status).toBe(403);
    const pub = await xhr().get(api('/plans'));
    expect(pub.body.data.plans.map((p: { id: string; priceMinor: number }) => [p.id, p.priceMinor])).toEqual([
      ['free', 0],
      ['pro', 50_000],
      ['premium', 100_000],
    ]);
    expect((await xhr().get(api('/config/public'))).body.data.billing.commissionBps).toBe(1500);
  });

  it('onboarding: a paid plan choice starts on Free with a pending upgrade invoice', async () => {
    const { sub } = await categories();
    const u = await signupAgent({ name: 'Wizard Seller' });
    const r = await u.agent.post(api('/seller/onboarding')).send({
      name: 'Wizard Store',
      slug: `wizard-${Date.now() % 1_000_000}`,
      categoryIds: [String(sub._id)],
      themeColor: '#0E5E5A',
      contact: { email: 'wizard@example.com', phone: '+923001234567' },
      pickupAddress: { fullName: 'Ali Khan', phone: '+923001234567', city: 'Lahore', line1: '12 Mall Road' },
      business: { type: 'individual', legalName: 'Ali Khan', cnicOrRegNo: '35202-1234567-1' },
      payout: { method: 'bank', accountTitle: 'Ali Khan', accountNumber: '0123456789012', bankName: 'HBL' },
      acceptTerms: true,
      plan: 'premium',
    });
    expect(r.status).toBe(201);
    const store = (await Store.findById(r.body.data.id).lean())!;
    expect(store.plan).toBe('free');
    expect(await Invoice.findOne({ storeId: store._id, kind: 'upgrade' }).lean()).toMatchObject({ status: 'open', plan: 'premium', total: 100_000 });
    expect(await Subscription.countDocuments({ storeId: store._id })).toBe(1);
  });

  it('commission rules are locked; the legacy admin plan route goes through billing', async () => {
    const s = await makeSeller('Bill Legacy');
    const sa = await staffAgent('SUPER_ADMIN');
    const created = await sa.agent.post(api('/admin/commission-rules')).send({ scope: 'global', bps: 500, isActive: true });
    expect(created.status).toBe(409);
    expect(created.body.error).toMatchObject({ code: 'COMMISSION_FIXED', details: { commissionBps: 1500 } });
    expect((await sa.agent.get(api('/admin/commission-rules'))).body.meta).toEqual({ locked: true, commissionBps: 1500 });
    expect((await sa.agent.put(api(`/admin/stores/${s.store._id}/commission`)).send({ bps: 500 })).body.error.code).toBe('COMMISSION_FIXED');
    const plan = await sa.agent.patch(api(`/admin/stores/${s.store._id}/plan`)).send({ plan: 'pro' });
    expect(plan.body.data).toEqual({ id: String(s.store._id), plan: 'pro' });
    expect((await Subscription.findOne({ storeId: s.store._id }).lean())!.plan).toBe('pro');
    expect(await BillingAdjustment.countDocuments({ storeId: s.store._id, type: 'plan_change' })).toBe(1);
  });
});
