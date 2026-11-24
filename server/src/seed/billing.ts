import { logger } from '../lib/logger';
import { withTx } from '../lib/tx';
import { BillingAdjustment } from '../modules/billing/adjustment.model';
import { addToInvoice, markOverdue, processStoreCycle } from '../modules/billing/billing.service';
import { BillingPayment } from '../modules/billing/billingPayment.model';
import { syncCommissions } from '../modules/billing/commission.service';
import { CommissionEntry } from '../modules/billing/commissionEntry.model';
import { Invoice } from '../modules/billing/invoice.model';
import { Subscription } from '../modules/billing/subscription.model';
import { ensureSubscription, lockStoreFinance } from '../modules/billing/subscription.service';
import { reconcileLedger } from '../modules/finance/finance.service';
import { SellerLedger } from '../modules/finance/ledger.model';
import { Store } from '../modules/stores/store.model';
import { User } from '../modules/users/user.model';

const DAY = 86_400_000;

/**
 * DEMO billing data (docs/api-billing.md). Everything is derived through the real billing code:
 * commission entries come from the seeded delivered orders (flat 15%), invoices are issued by the
 * real renewal step for a period that ended in the past. Results:
 * - every demo store has a subscription (plan mix Free / Pro / Premium from data/stores.ts);
 * - the first paying store's invoice is PAID (verified bank transfer),
 * - the next one is OPEN with a manual payment waiting in the admin verification queue,
 * - one Pro store (the last one) is OVERDUE → billing-suspended (hidden from buyers until it pays).
 * Idempotent: skipped when demo invoices already exist. All documents carry `demo: true`.
 */
export async function seedBilling(): Promise<Record<string, number>> {
  if (await Invoice.exists({ demo: true })) return { skipped: 1 };
  const stores = await Store.find({ demo: true, status: 'approved' }).sort({ createdAt: 1 }).select('_id plan slug').lean();
  if (!stores.length) return { skipped: 1 };
  const out = { subscriptions: 0, commissions: 0, invoices: 0, paid: 0, pendingManual: 0, suspended: 0 };
  const now = new Date();

  for (const s of stores) {
    await ensureSubscription(s._id, now);
    out.subscriptions++;
  }
  await Subscription.updateMany({ storeId: { $in: stores.map((s) => s._id) } }, { $set: { demo: true } });
  out.commissions = (await syncCommissions()).charges;
  for (const s of stores) await reconcileLedger(s._id);

  // One billing period that ended in the past for every demo store: paid stores get fee + COD commission,
  // Free stores only their COD commission. The last store's period ended long enough ago to be overdue.
  const overdueStore = String(([...stores].reverse().find((s) => s.plan === 'pro') ?? stores[stores.length - 1]!)._id);
  for (const s of stores) {
    const overdueCandidate = String(s._id) === overdueStore;
    const end = new Date(now.getTime() - (overdueCandidate ? 12 : 3) * DAY);
    await Subscription.updateOne({ storeId: s._id }, { $set: { currentPeriodStart: new Date(end.getTime() - 30 * DAY), currentPeriodEnd: end, anchorDay: end.getUTCDate() } });
    const r = await processStoreCycle(s._id, now);
    out.invoices += r.issued;
  }

  const invoices = await Invoice.find({ storeId: { $in: stores.map((s) => s._id) }, kind: 'renewal' }).sort({ issuedAt: 1 }).lean();
  const admin = await User.findOne({ platformRole: 'SUPER_ADMIN' }).select('_id').lean();
  const payable = invoices.filter((inv) => String(inv.storeId) !== overdueStore);

  // 1) Paid by a verified bank transfer.
  const paid = payable[0];
  if (paid) {
    const ref = `DEMO-HBL-${paid.number.slice(-6)}`;
    await withTx(async (session) => {
      await lockStoreFinance(paid.storeId, session);
      const [p] = await BillingPayment.create(
        [{ storeId: paid.storeId, invoiceId: paid._id, invoiceNumber: paid.number, method: 'manual', amount: paid.total, status: 'succeeded', channel: 'bank', reference: ref, refLock: `bank:${ref}`, reviewedBy: admin?._id, reviewedAt: now, reviewNote: 'Demo: verified in bank statement', demo: true }],
        { session },
      );
      await addToInvoice(paid._id, { paid: paid.total }, now, session);
      await BillingAdjustment.create([{ storeId: paid.storeId, type: 'manual_payment', invoiceId: paid._id, paymentId: p!._id, amount: paid.total, reason: 'Demo: verified bank transfer', by: admin?._id ?? null, demo: true }], { session });
    });
    out.paid++;
  }
  // 2) Open, with a manual payment waiting for admin verification.
  const pending = payable[1];
  if (pending) {
    const ref = `DEMO-JC-${pending.number.slice(-6)}`;
    await BillingPayment.create({ storeId: pending.storeId, invoiceId: pending._id, invoiceNumber: pending.number, method: 'manual', amount: pending.total, status: 'pending', channel: 'jazzcash', reference: ref, refLock: `jazzcash:${ref}`, note: 'Sent from shop JazzCash account', demo: true });
    out.pendingManual++;
  }
  // 3) Overdue → billing suspension through the real sweep step.
  const r = await markOverdue(now);
  out.suspended = r.suspended;
  await CommissionEntry.updateMany({ storeId: { $in: stores.map((s) => s._id) } }, { $set: { demo: true } });
  await SellerLedger.updateMany({ storeId: { $in: stores.map((s) => s._id) } }, { $set: { demo: true } });
  logger.info({ ...out, suspendedStore: r.suspended ? stores.find((s) => String(s._id) === overdueStore)?.slug : null }, 'Billing demo data seeded');
  return out;
}
