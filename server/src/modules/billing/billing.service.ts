import {
  DEFAULT_BILLING_GRACE_DAYS,
  PLANS,
  PLATFORM_COMMISSION_BPS,
  billingSettingsSchema,
  formatMoney,
  normalizePlan,
  planRank,
  type BillingSettings,
  type ChangePlanResultDTO,
  type CommissionEntryDTO,
  type InvoiceDTO,
  type SubscriptionDTO,
  type StorePlan,
} from '@souqly/shared';
import type { Request } from 'express';
import { Types, type ClientSession } from 'mongoose';
import { AppError, notFound } from '../../lib/AppError';
import { randomCode } from '../../lib/crypto';
import { logger } from '../../lib/logger';
import { isDuplicateKey, withTx } from '../../lib/tx';
import { getJobs } from '../../services/jobs';
import { audit } from '../audit/audit.service';
import { invalidateStoreIndex } from '../catalog/catalog.service';
import { computeBalance } from '../finance/hold';
import { SellerLedger } from '../finance/ledger.model';
import { notify } from '../notifications/notification.service';
import { getSetting, setSetting } from '../settings/settings.service';
import { Store } from '../stores/store.model';
import { BillingAdjustment } from './adjustment.model';
import { BillingPayment } from './billingPayment.model';
import { creditCommissionBack } from './commission.service';
import { CommissionEntry, type CommissionEntryLean } from './commissionEntry.model';
import { Invoice, amountDue, type IInvoiceLine, type InvoiceLean } from './invoice.model';
import { addDays, addMonths, unusedCredit } from './period';
import { Subscription, type SubscriptionLean } from './subscription.model';
import { ensureSubscription, lockStoreFinance } from './subscription.service';

/** Subscriptions, invoices and billing enforcement (docs/api-billing.md §3-4, D-081..D-086). */

const oid = (s: string | Types.ObjectId) => new Types.ObjectId(String(s));
const iso = (d?: Date | null) => (d ? new Date(d).toISOString() : null);

// ---------------- settings ----------------
export async function getBillingSettings(): Promise<BillingSettings> {
  const raw = await getSetting<unknown>('billing').catch(() => undefined);
  const parsed = billingSettingsSchema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  const r = (raw ?? {}) as Partial<BillingSettings>;
  return {
    graceDays: typeof r.graceDays === 'number' && Number.isInteger(r.graceDays) && r.graceDays >= 0 && r.graceDays <= 60 ? r.graceDays : DEFAULT_BILLING_GRACE_DAYS,
    manualAccounts: Array.isArray(r.manualAccounts) ? (r.manualAccounts as BillingSettings['manualAccounts']) : [],
  };
}
export async function setBillingSettings(req: Request, s: BillingSettings): Promise<BillingSettings> {
  await setSetting('billing', s);
  await audit({ action: 'admin.billing_settings_updated', targetType: 'Setting', targetId: 'billing', meta: { graceDays: s.graceDays, manualAccounts: s.manualAccounts.length }, req });
  return getBillingSettings();
}

// ---------------- DTOs ----------------
export function invoiceDTO(i: InvoiceLean, extra: { pendingPayment?: { _id: Types.ObjectId; method: string; createdAt: Date } | null; store?: { _id: unknown; name: string; slug: string } | null } = {}): InvoiceDTO {
  return {
    id: String(i._id),
    number: i.number,
    kind: i.kind,
    status: i.status,
    plan: i.plan,
    periodStart: iso(i.periodStart)!,
    periodEnd: iso(i.periodEnd)!,
    lines: i.lines.map((l) => ({
      type: l.type,
      description: l.description,
      amount: l.amount,
      ...(l.plan ? { plan: l.plan } : {}),
      ...(l.periodStart ? { periodStart: iso(l.periodStart)! } : {}),
      ...(l.periodEnd ? { periodEnd: iso(l.periodEnd)! } : {}),
      ...(l.entries !== undefined ? { entries: l.entries } : {}),
    })),
    total: i.total,
    amountPaid: i.amountPaid,
    amountWaived: i.amountWaived,
    amountDue: amountDue(i),
    issuedAt: iso(i.issuedAt)!,
    dueDate: iso(i.dueDate)!,
    paidAt: iso(i.paidAt),
    voidedAt: iso(i.voidedAt),
    voidReason: i.voidReason ?? null,
    pendingPayment: extra.pendingPayment ? { id: String(extra.pendingPayment._id), method: extra.pendingPayment.method === 'gateway' ? 'gateway' : 'manual', createdAt: iso(extra.pendingPayment.createdAt)! } : null,
    ...(extra.store ? { store: { id: String(extra.store._id), name: extra.store.name, slug: extra.store.slug } } : {}),
  };
}

export function commissionDTO(e: CommissionEntryLean, invoiceNumbers?: Map<string, string>): CommissionEntryDTO {
  return {
    id: String(e._id),
    kind: e.kind,
    channel: e.channel,
    orderId: String(e.orderId),
    orderNumber: e.orderNumber,
    base: e.base,
    bps: e.bps,
    amount: e.amount,
    orderTotal: e.orderTotal,
    status: e.status,
    invoiceId: e.invoiceId ? String(e.invoiceId) : null,
    invoiceNumber: e.invoiceId ? (invoiceNumbers?.get(String(e.invoiceId)) ?? null) : null,
    reason: e.reason,
    at: iso(e.at)!,
    settledAt: iso(e.settledAt),
  };
}

export async function subscriptionDTO(storeId: Types.ObjectId): Promise<SubscriptionDTO> {
  const [sub, store, upgrade] = await Promise.all([
    ensureSubscription(storeId),
    Store.findById(storeId).select('plan billingStatus billingSuspension').lean(),
    Invoice.findOne({ storeId, kind: 'upgrade', status: 'open' }).lean<InvoiceLean>(),
  ]);
  const s = store?.billingSuspension;
  return {
    plan: normalizePlan(store?.plan ?? sub.plan),
    billingStatus: (store?.billingStatus ?? 'active') as 'active' | 'suspended',
    suspension: store?.billingStatus === 'suspended' && s ? { reason: s.reason, invoiceId: s.invoiceId ? String(s.invoiceId) : null, note: s.note ?? null, at: iso(s.at)! } : null,
    currentPeriodStart: iso(sub.currentPeriodStart)!,
    currentPeriodEnd: iso(sub.currentPeriodEnd)!,
    scheduledChange: sub.scheduledChange ? { plan: sub.scheduledChange.plan, effectiveAt: iso(sub.scheduledChange.effectiveAt)!, kind: sub.scheduledChange.kind } : null,
    pendingUpgrade: upgrade ? { plan: upgrade.plan, invoiceId: String(upgrade._id), invoiceNumber: upgrade.number, amountDue: amountDue(upgrade), dueDate: iso(upgrade.dueDate)! } : null,
  };
}

// ---------------- helpers ----------------
export const newInvoiceNumber = (at = new Date()) => `SB-${at.toISOString().slice(2, 7).replace('-', '')}-${randomCode(6)}`;

async function storeOwner(storeId: Types.ObjectId) {
  return Store.findById(storeId).select('ownerId name slug').lean();
}

function notifyOwner(ownerId: Types.ObjectId | undefined, type: string, title: string, body: string) {
  if (ownerId) void notify({ userId: ownerId, type, title, body, link: '/seller/billing' });
}

/** Lifts a billing suspension caused by overdue invoices once none is left overdue (admin suspensions stay). */
async function liftOverdueSuspension(storeId: Types.ObjectId, session: ClientSession): Promise<boolean> {
  const store = await Store.findById(storeId).select('billingStatus billingSuspension').session(session).lean();
  if (store?.billingStatus !== 'suspended' || store.billingSuspension?.reason !== 'overdue') return false;
  if (await Invoice.exists({ storeId, kind: 'renewal', status: 'overdue' }).session(session)) return false;
  await Store.updateOne({ _id: storeId, billingStatus: 'suspended' }, { $set: { billingStatus: 'active', billingSuspension: null } }, { session });
  return true;
}

/**
 * Applies a paid upgrade: new plan with a fresh monthly period starting now (code review H1). The old plan's
 * current period is superseded, so its unused part is settled exactly once:
 * - its renewal invoice is still open/overdue → the unused share of its subscription line is waived on it;
 * - it was paid (or grandfathered) but the upgrade invoice carried no credit for it (e.g. the renewal was paid
 *   after the upgrade invoice was issued, or the period rolled over) → the difference is credited to the
 *   seller balance (`plan_credit`).
 */
async function applyUpgrade(inv: InvoiceLean, now: Date, session: ClientSession) {
  const sub = await Subscription.findOne({ storeId: inv.storeId }).session(session).lean<SubscriptionLean>();
  if (sub && sub.currentPeriodEnd > now) {
    const oldPlan = normalizePlan(sub.plan);
    const fee = PLANS[oldPlan].priceMinor;
    const unused = unusedCredit(fee, sub.currentPeriodStart, sub.currentPeriodEnd, now);
    // Credit already given on this upgrade invoice for this very period.
    const given = -inv.lines.filter((l) => l.type === 'proration_credit' && l.periodStart && new Date(l.periodStart).getTime() === sub.currentPeriodStart.getTime()).reduce((s, l) => s + l.amount, 0);
    let owed = Math.max(0, unused - given);
    if (owed > 0) {
      const renewal = await Invoice.findOne({ storeId: inv.storeId, kind: 'renewal', periodStart: sub.currentPeriodStart, status: { $in: ['open', 'overdue'] } }).session(session).lean<InvoiceLean>();
      if (renewal) {
        const subLine = renewal.lines.filter((l) => l.type === 'subscription').reduce((s, l) => s + l.amount, 0);
        const waive = Math.min(owed, subLine, amountDue(renewal));
        if (waive > 0) {
          const r = await Invoice.updateOne(
            { _id: renewal._id, status: renewal.status, amountPaid: renewal.amountPaid, amountWaived: renewal.amountWaived },
            { $inc: { amountWaived: waive } },
            { session },
          );
          if (!r.modifiedCount) throw new AppError(409, 'INVOICE_CHANGED', 'An invoice changed while applying the upgrade. Please try again.');
          await BillingAdjustment.create([{ storeId: inv.storeId, type: 'waiver', invoiceId: renewal._id, amount: waive, reason: `Unused ${PLANS[oldPlan].name} time superseded by upgrade ${inv.number}`, meta: { upgradeInvoice: inv.number, system: true } }], { session });
          owed -= waive;
          if (amountDue({ ...renewal, amountWaived: renewal.amountWaived + waive }) === 0) await finalizeInvoice(renewal._id, now, session);
        }
      } else if (await periodWasPaid(inv.storeId, sub, session)) {
        await SellerLedger.create([{ storeId: inv.storeId, type: 'plan_credit', amount: owed, ref: `plan_credit:${String(inv._id)}`, invoiceId: inv._id, availableAt: now, at: now, demo: !!sub.demo }], { session });
        owed = 0;
      }
    }
  }
  await Subscription.updateOne(
    { storeId: inv.storeId },
    { $set: { plan: inv.plan, currentPeriodStart: now, currentPeriodEnd: addMonths(now, 1), anchorDay: now.getUTCDate(), scheduledChange: null } },
    { session },
  );
  await Store.updateOne({ _id: inv.storeId }, { $set: { plan: inv.plan } }, { session });
}

export type SettleResult = { settled: boolean; lifted: boolean; upgraded: boolean; invoice: InvoiceLean };

/**
 * Adds `paid` / `waived` to an open or overdue invoice (conditional on the amounts read, so two concurrent
 * settlements can't both count) and finalises it when nothing is left due: invoice paid/waived, linked
 * commission entries paid/waived, upgrade applied, overdue suspension lifted. Must run inside withTx.
 */
export async function addToInvoice(invoiceId: Types.ObjectId, add: { paid?: number; waived?: number }, now: Date, session: ClientSession): Promise<SettleResult> {
  const inv = await Invoice.findById(invoiceId).session(session).lean<InvoiceLean>();
  if (!inv) throw notFound('Invoice');
  if (inv.status !== 'open' && inv.status !== 'overdue') throw new AppError(409, 'INVOICE_NOT_PAYABLE', `This invoice is ${inv.status}`);
  const paid = add.paid ?? 0;
  const waived = add.waived ?? 0;
  if (paid + waived > amountDue(inv)) throw new AppError(400, 'AMOUNT_EXCEEDS_DUE', 'The amount is more than what is due on this invoice', { amountDue: amountDue(inv) });
  const updated = await Invoice.findOneAndUpdate(
    { _id: inv._id, status: inv.status, amountPaid: inv.amountPaid, amountWaived: inv.amountWaived },
    { $inc: { amountPaid: paid, amountWaived: waived } },
    { new: true, session },
  ).lean<InvoiceLean>();
  if (!updated) throw new AppError(409, 'INVOICE_CHANGED', 'This invoice was just updated. Please refresh and try again.');
  if (amountDue(updated) > 0) return { settled: false, lifted: false, upgraded: false, invoice: updated };

  const final = await finalizeInvoice(updated._id, now, session);
  let upgraded = false;
  if (updated.kind === 'upgrade') {
    await applyUpgrade(updated, now, session);
    upgraded = true;
  }
  const lifted = await liftOverdueSuspension(updated.storeId, session);
  return { settled: true, lifted, upgraded, invoice: final };
}

/**
 * Marks a fully settled invoice paid/waived, settles its commission entries and cancels any other payment
 * attempt still pending on it (code review M11: a manual claim must not linger in the admin queue holding
 * its reference lock). Must run inside withTx.
 */
async function finalizeInvoice(invoiceId: Types.ObjectId, now: Date, session: ClientSession): Promise<InvoiceLean> {
  const cur = (await Invoice.findById(invoiceId).session(session).lean<InvoiceLean>())!;
  const status = cur.amountPaid > 0 ? 'paid' : 'waived';
  const final = (await Invoice.findOneAndUpdate({ _id: invoiceId }, { $set: { status, paidAt: now } }, { new: true, session }).lean<InvoiceLean>())!;
  await CommissionEntry.updateMany({ invoiceId, status: 'invoiced' }, { $set: { status: status === 'paid' ? 'paid' : 'waived', settledAt: now } }, { session });
  await BillingPayment.updateMany({ invoiceId, status: 'pending' }, { $set: { status: 'cancelled', reviewNote: `Invoice ${status} another way` }, $unset: { refLock: 1 } }, { session });
  return final;
}

/** True when the store's current period was paid for (renewal paid) or grandfathered (no renewal and no admin comp). */
async function periodWasPaid(storeId: Types.ObjectId, sub: SubscriptionLean, session: ClientSession): Promise<boolean> {
  const periodInvoice = await Invoice.findOne({ storeId, kind: 'renewal', periodStart: sub.currentPeriodStart }).session(session).lean<InvoiceLean>();
  if (periodInvoice) return periodInvoice.status === 'paid';
  // No renewal for this period: grandfathered (first period) unless Souqly comped the plan (code review L3).
  const comped = await BillingAdjustment.exists({ storeId, type: 'plan_change', createdAt: { $gte: sub.currentPeriodStart } }).session(session);
  return !comped;
}

/** Post-commit side effects of a settlement (never inside the transaction: it may retry). */
export async function afterSettlement(r: SettleResult, req?: Request) {
  if (r.lifted || r.upgraded) invalidateStoreIndex();
  const owner = await storeOwner(r.invoice.storeId);
  if (r.settled) {
    notifyOwner(owner?.ownerId, 'billing.invoice_paid', 'Invoice paid', `Invoice ${r.invoice.number} is settled. Thank you!`);
    await audit({ action: `billing.invoice_${r.invoice.status}`, targetType: 'Invoice', targetId: r.invoice._id, storeId: r.invoice.storeId, meta: { number: r.invoice.number, total: r.invoice.total, paid: r.invoice.amountPaid, waived: r.invoice.amountWaived }, ...(req ? { req } : { actorRole: 'system' }) });
  }
  if (r.upgraded) {
    notifyOwner(owner?.ownerId, 'billing.plan_upgraded', `You are now on ${PLANS[r.invoice.plan].name}`, 'Your new plan is active.');
    await audit({ action: 'billing.plan_upgraded', targetType: 'Store', targetId: r.invoice.storeId, storeId: r.invoice.storeId, meta: { plan: r.invoice.plan, invoice: r.invoice.number }, ...(req ? { req } : { actorRole: 'system' }) });
  }
  if (r.lifted) {
    notifyOwner(owner?.ownerId, 'billing.reactivated', 'Your store is live again', 'Thanks for paying your dues. Your store is visible to buyers again.');
    await audit({ action: 'billing.suspension_lifted', targetType: 'Store', targetId: r.invoice.storeId, storeId: r.invoice.storeId, meta: { reason: 'paid' }, actorRole: 'system' });
  }
}

// ---------------- monthly cycle ----------------
type RenewOutcome = { invoice?: InvoiceLean; advanced: boolean; credited: number };

/** Minimum days a seller gets to pay a renewal, even one issued late (catch-up after downtime; code review M3). */
export const MIN_NOTICE_DAYS = 3;
export const renewalDueDate = (cutoff: Date, graceDays: number, now: Date) => new Date(Math.max(addDays(cutoff, graceDays).getTime(), addDays(now, MIN_NOTICE_DAYS).getTime()));

/**
 * A reversal whose charge was billed on an earlier invoice (code review H2): money only goes back for
 * commission the seller actually paid.
 * - charge `paid` → credit the seller balance (`commission_credit`);
 * - charge `waived` → nothing was paid: the reversal is `waived`;
 * - charge still `invoiced` (invoice open/overdue) → the open invoice is lowered by the reversal (a negative
 *   commission line); any part the invoice can no longer absorb (already partly paid) is credited.
 * Must run inside withTx (under the store finance lock).
 */
export async function settleBilledReversal(rev: CommissionEntryLean, now: Date, session: ClientSession): Promise<void> {
  const charge = rev.chargeId ? await CommissionEntry.findById(rev.chargeId).session(session).lean<CommissionEntryLean>() : null;
  const amount = -rev.amount;
  if (!charge || amount <= 0) return;
  if (charge.status === 'waived') {
    await CommissionEntry.updateOne({ _id: rev._id }, { $set: { status: 'waived', settledAt: now } }, { session });
    return;
  }
  if (charge.status === 'invoiced' && charge.invoiceId) {
    const inv = await Invoice.findById(charge.invoiceId).session(session).lean<InvoiceLean>();
    if (inv && (inv.status === 'open' || inv.status === 'overdue')) {
      const lower = Math.min(amount, amountDue(inv));
      if (lower > 0) {
        const r = await Invoice.updateOne(
          { _id: inv._id, status: inv.status, total: inv.total, amountPaid: inv.amountPaid, amountWaived: inv.amountWaived },
          { $inc: { total: -lower }, $push: { lines: { type: 'commission', description: `Commission reversal ${rev.orderNumber}`, amount: -lower, entries: 1 } } },
          { session },
        );
        if (!r.modifiedCount) throw new AppError(409, 'INVOICE_CHANGED', 'Invoice changed while applying a commission reversal');
        await CommissionEntry.updateOne({ _id: rev._id }, { $set: { status: 'paid', invoiceId: inv._id, settledAt: now } }, { session });
        if (amountDue({ ...inv, total: inv.total - lower }) === 0) await finalizeInvoice(inv._id, now, session);
      }
      if (amount - lower > 0) await creditCommissionBack(rev.storeId, rev._id, rev.ref, amount - lower, now, rev.orderId, rev.orderNumber, session, !!rev.demo);
      return;
    }
    // The invoice was settled meanwhile: fall through by its outcome.
    if (inv?.status === 'waived') {
      await CommissionEntry.updateOne({ _id: rev._id }, { $set: { status: 'waived', settledAt: now } }, { session });
      return;
    }
  }
  await creditCommissionBack(rev.storeId, rev._id, rev.ref, amount, now, rev.orderId, rev.orderNumber, session, !!rev.demo);
}

/** Issues the renewal invoice for one ended period and advances the subscription (one transaction). */
async function renewOnce(storeId: Types.ObjectId, now: Date, graceDays: number): Promise<RenewOutcome> {
  return withTx(async (session) => {
    await lockStoreFinance(storeId, session);
    const sub = await Subscription.findOne({ storeId }).session(session).lean<SubscriptionLean>();
    if (!sub || sub.currentPeriodEnd > now) return { advanced: false, credited: 0 };
    const cutoff = sub.currentPeriodEnd;
    const nextPlan = sub.scheduledChange && sub.scheduledChange.effectiveAt <= cutoff ? normalizePlan(sub.scheduledChange.plan) : normalizePlan(sub.plan);
    const nextStart = cutoff;
    const nextEnd = addMonths(cutoff, 1, sub.anchorDay);
    const invoiceId = new Types.ObjectId();

    // COD commission recognized up to the cut-off and not billed yet.
    const unpaid = await CommissionEntry.find({ storeId, channel: 'cod', status: 'unpaid', at: { $lte: cutoff } }).session(session).lean<CommissionEntryLean[]>();
    const chargeIds = new Set(unpaid.filter((e) => e.kind === 'charge').map((e) => String(e._id)));
    const batch: CommissionEntryLean[] = [];
    let credited = 0;
    for (const e of unpaid) {
      if (e.kind === 'reversal' && !chargeIds.has(String(e.chargeId))) {
        // Its charge was billed on an earlier invoice: settle by what happened to that charge (code review H2).
        await settleBilledReversal(e, now, session);
        credited++;
      } else batch.push(e);
    }
    const commission = Math.max(0, batch.reduce((s, e) => s + e.amount, 0));
    const fee = PLANS[nextPlan].priceMinor;

    // A negative seller balance (COD refunds Souqly paid to buyers) is recovered on the invoice.
    // On-hold sale credits will cover part of it, so only the truly negative balance is billed (code review L4).
    const rows = await SellerLedger.find({ storeId }).select('type amount availableAt').session(session).lean();
    const bal = computeBalance(rows, now);
    const net = bal.available + bal.onHold;
    const recovery = net < 0 ? -net : 0;

    const lines: IInvoiceLine[] = [];
    if (fee > 0) lines.push({ type: 'subscription', description: `${PLANS[nextPlan].name} plan (monthly)`, amount: fee, plan: nextPlan, periodStart: nextStart, periodEnd: nextEnd });
    if (batch.length && commission > 0) lines.push({ type: 'commission', description: `Commission ${PLATFORM_COMMISSION_BPS / 100}% on COD orders up to ${cutoff.toISOString().slice(0, 10)}`, amount: commission, entries: batch.length });
    if (recovery > 0) lines.push({ type: 'balance_recovery', description: 'Refunds paid to buyers on your COD orders (negative balance)', amount: recovery });
    const total = lines.reduce((s, l) => s + l.amount, 0);

    let invoice: InvoiceLean | undefined;
    if (total > 0) {
      const [created] = await Invoice.create(
        [{ _id: invoiceId, storeId, number: newInvoiceNumber(now), kind: 'renewal', status: 'open', plan: nextPlan, periodStart: nextStart, periodEnd: nextEnd, lines, total, issuedAt: now, dueDate: renewalDueDate(cutoff, graceDays, now), demo: sub.demo }],
        { session },
      );
      invoice = created!.toObject() as InvoiceLean;
      if (batch.length) {
        const r = await CommissionEntry.updateMany({ _id: { $in: batch.map((e) => e._id) }, status: 'unpaid' }, { $set: { status: 'invoiced', invoiceId } }, { session });
        if (r.modifiedCount !== batch.length) throw new AppError(409, 'COMMISSION_CHANGED', 'Commission entries changed while invoicing');
      }
      if (recovery > 0) {
        await SellerLedger.create([{ storeId, type: 'balance_transfer', amount: recovery, ref: `balance_transfer:${String(invoiceId)}`, invoiceId, availableAt: now, at: now, demo: sub.demo }], { session });
      }
    } else if (batch.length) {
      // Reversals fully offset their charges: nothing to bill, the pair is settled.
      await CommissionEntry.updateMany({ _id: { $in: batch.map((e) => e._id) }, status: 'unpaid' }, { $set: { status: 'paid', settledAt: now } }, { session });
    }
    // An upgrade invoice priced against the period that just ended is stale (its proration no longer applies):
    // void it; the seller re-requests the upgrade at the new period's price (code review H1).
    await Invoice.updateMany({ storeId, kind: 'upgrade', status: 'open', issuedAt: { $lt: cutoff } }, { $set: { status: 'void', voidedAt: now, voidReason: 'period_ended' } }, { session });
    await Subscription.updateOne({ storeId }, { $set: { plan: nextPlan, currentPeriodStart: nextStart, currentPeriodEnd: nextEnd, scheduledChange: null } }, { session });
    await Store.updateOne({ _id: storeId }, { $set: { plan: nextPlan } }, { session });
    return { invoice, advanced: true, credited };
  });
}

/** Renews every ended period of one store (catches up after downtime, max 24 periods per run). */
export async function processStoreCycle(storeId: Types.ObjectId, now = new Date()): Promise<{ issued: number; advanced: number }> {
  const { graceDays } = await getBillingSettings();
  let issued = 0;
  let advanced = 0;
  for (let i = 0; i < 24; i++) {
    const r = await renewOnce(storeId, now, graceDays);
    if (!r.advanced) break;
    advanced++;
    if (r.invoice) {
      issued++;
      const owner = await storeOwner(storeId);
      notifyOwner(owner?.ownerId, 'billing.invoice_issued', 'New invoice', `Invoice ${r.invoice.number} for ${formatMoney(r.invoice.total)} is due by ${r.invoice.dueDate.toISOString().slice(0, 10)}.`);
      await audit({ action: 'billing.invoice_issued', actorRole: 'system', targetType: 'Invoice', targetId: r.invoice._id, storeId, meta: { number: r.invoice.number, total: r.invoice.total, kind: 'renewal' } });
    }
  }
  return { issued, advanced };
}

/**
 * Suspends a store for billing (idempotent; never touches moderation `status`). An admin hold takes
 * precedence over an overdue suspension (code review H3): it replaces the `overdue` reason, so paying the
 * overdue invoice no longer lifts it — only an admin reactivation does.
 */
export async function suspendForBilling(storeId: Types.ObjectId, s: { reason: 'overdue' | 'admin'; invoiceId?: Types.ObjectId; note?: string; by?: Types.ObjectId }, session?: ClientSession): Promise<boolean> {
  const r = await Store.updateOne(
    s.reason === 'admin' ? { _id: storeId, $or: [{ billingStatus: { $ne: 'suspended' } }, { 'billingSuspension.reason': 'overdue' }] } : { _id: storeId, billingStatus: { $ne: 'suspended' } },
    { $set: { billingStatus: 'suspended', billingSuspension: { reason: s.reason, invoiceId: s.invoiceId ?? null, ...(s.note ? { note: s.note } : {}), at: new Date(), by: s.by ?? null } } },
    session ? { session } : {},
  );
  return r.modifiedCount === 1;
}

/**
 * Marks open invoices past due: renewal -> overdue + billing suspension; upgrade -> void (plan unchanged).
 * Each invoice is handled in its own transaction under the store finance lock, re-checked there, so a payment
 * settling the invoice at the same moment can never leave the store suspended without an overdue invoice
 * (security review L3, code review M2). Side effects (audit, notifications) run after commit.
 */
export async function markOverdue(now = new Date(), deadline = Infinity): Promise<{ overdue: number; suspended: number; voided: number; more: number }> {
  const out = { overdue: 0, suspended: 0, voided: 0, more: 0 };
  const due = await Invoice.find({ status: 'open', dueDate: { $lt: now } }).sort({ dueDate: 1 }).select('storeId kind number').limit(2000).lean<InvoiceLean[]>();
  for (const inv of due) {
    if (Date.now() > deadline) {
      out.more = 1;
      break;
    }
    try {
      await ensureSubscription(inv.storeId);
      const r = await withTx(async (session) => {
        await lockStoreFinance(inv.storeId, session);
        const fresh = await Invoice.findOne({ _id: inv._id, status: 'open', dueDate: { $lt: now } }).session(session).lean<InvoiceLean>();
        if (!fresh || amountDue(fresh) <= 0) return null;
        if (fresh.kind === 'upgrade') {
          if (await BillingPayment.exists({ invoiceId: fresh._id, status: 'pending', method: 'manual' }).session(session)) return null; // wait for the admin review
          await Invoice.updateOne({ _id: fresh._id, status: 'open' }, { $set: { status: 'void', voidedAt: now, voidReason: 'expired' } }, { session });
          return 'voided' as const;
        }
        await Invoice.updateOne({ _id: fresh._id, status: 'open' }, { $set: { status: 'overdue', overdueAt: now } }, { session });
        return (await suspendForBilling(inv.storeId, { reason: 'overdue', invoiceId: fresh._id }, session)) ? ('suspended' as const) : ('overdue' as const);
      });
      if (!r) continue;
      if (r === 'voided') {
        out.voided++;
        continue;
      }
      out.overdue++;
      const owner = await storeOwner(inv.storeId);
      if (r === 'suspended') {
        out.suspended++;
        invalidateStoreIndex();
        await audit({ action: 'billing.store_suspended', actorRole: 'system', targetType: 'Store', targetId: inv.storeId, storeId: inv.storeId, meta: { reason: 'overdue', invoice: inv.number } });
        notifyOwner(owner?.ownerId, 'billing.suspended', 'Store hidden: invoice overdue', `Invoice ${inv.number} is overdue. Pay it to make your store visible again.`);
      } else {
        notifyOwner(owner?.ownerId, 'billing.overdue', 'Invoice overdue', `Invoice ${inv.number} is overdue.`);
      }
    } catch (err) {
      logger.error({ err, invoice: inv.number }, 'Marking invoice overdue failed (retried next sweep)');
    }
  }
  if (due.length === 2000) out.more = 1;
  return out;
}

/** One-time / idempotent data migrations for billing (safe on every boot and every sweep). */
export async function migrateBilling(): Promise<{ plans: number }> {
  // Rename the legacy `business` plan to `premium` everywhere (raw collection: the enum no longer accepts it).
  const plans = (await Store.collection.updateMany({ plan: 'business' }, { $set: { plan: 'premium' } })).modifiedCount;
  await Subscription.collection.updateMany({ plan: 'business' }, { $set: { plan: 'premium' } });
  await Subscription.collection.updateMany({ 'scheduledChange.plan': 'business' }, { $set: { 'scheduledChange.plan': 'premium' } });
  const { PlanRequest } = await import('../plans/plan.service');
  await PlanRequest.collection.updateMany({ plan: 'business' }, { $set: { plan: 'premium' } });
  await PlanRequest.collection.updateMany({ from: 'business' }, { $set: { from: 'premium' } });
  await Store.collection.updateMany({ billingStatus: { $exists: false } }, { $set: { billingStatus: 'active' } });
  // Under the flat-commission model COD sales are never balance credits (the seller holds the cash). Remove
  // pre-billing `sale:` credits of COD orders once; the commission ledger re-derives everything else.
  if (!(await getSetting<boolean>('migration.billingV1'))) {
    const { Order } = await import('../orders/order.model');
    const codIds = await Order.distinct('_id', { 'payment.method': 'cod' });
    const removed = (await SellerLedger.deleteMany({ type: 'sale', orderId: { $in: codIds } })).deletedCount;
    if (removed) logger.warn({ removed }, 'Billing migration: removed COD sale credits from the seller ledger');
    await setSetting('migration.billingV1', true);
  }
  return { plans };
}

// ---------------- plan changes ----------------
async function voidOpenUpgrade(storeId: Types.ObjectId, reason: string, now: Date, session: ClientSession) {
  const open = await Invoice.findOne({ storeId, kind: 'upgrade', status: 'open' }).session(session).lean<InvoiceLean>();
  if (!open) return null;
  if (await BillingPayment.exists({ invoiceId: open._id, status: 'pending', method: 'manual' }).session(session)) {
    throw new AppError(409, 'PAYMENT_PENDING', 'A payment for your plan upgrade is waiting for verification');
  }
  await BillingPayment.updateMany({ invoiceId: open._id, status: 'pending' }, { $set: { status: 'cancelled' } }, { session });
  await Invoice.updateOne({ _id: open._id, status: 'open' }, { $set: { status: 'void', voidedAt: now, voidReason: reason } }, { session });
  return open;
}

/** Creates the upgrade invoice (new plan price − unused paid time of the current plan). Must run in withTx. */
export async function createUpgradeInvoice(storeId: Types.ObjectId, target: StorePlan, now: Date, session: ClientSession): Promise<InvoiceLean> {
  const sub = (await Subscription.findOne({ storeId }).session(session).lean<SubscriptionLean>())!;
  const current = normalizePlan(sub.plan);
  await voidOpenUpgrade(storeId, 'replaced', now, session);
  const { graceDays } = await getBillingSettings();
  const lines: IInvoiceLine[] = [{ type: 'subscription', description: `${PLANS[target].name} plan (first month)`, amount: PLANS[target].priceMinor, plan: target }];
  const fee = PLANS[current].priceMinor;
  if (fee > 0) {
    // Credit only time that was actually paid for (or grandfathered): an unpaid renewal of this period gives no credit.
    // Only time that was actually paid for (or grandfathered) earns a credit: an unpaid/waived renewal or an admin-comped
    // plan gives none (code review L3). If the renewal is paid later, applyUpgrade settles the difference.
    const paid = await periodWasPaid(storeId, sub, session);
    const credit = paid ? unusedCredit(fee, sub.currentPeriodStart, sub.currentPeriodEnd, now) : 0;
    if (credit > 0) lines.push({ type: 'proration_credit', description: `Unused ${PLANS[current].name} time until ${sub.currentPeriodEnd.toISOString().slice(0, 10)}`, amount: -credit, plan: current, periodStart: sub.currentPeriodStart, periodEnd: sub.currentPeriodEnd });
  }
  const total = Math.max(0, lines.reduce((s, l) => s + l.amount, 0));
  const [inv] = await Invoice.create(
    [{ storeId, number: newInvoiceNumber(now), kind: 'upgrade', status: 'open', plan: target, periodStart: now, periodEnd: addMonths(now, 1), lines, total, issuedAt: now, dueDate: addDays(now, Math.max(1, graceDays)), demo: sub.demo }],
    { session },
  );
  return inv!.toObject() as InvoiceLean;
}

/** Seller plan change: upgrade → invoice (effective on payment); downgrade/cancel → scheduled at period end. */
export async function changePlan(req: Request, target: StorePlan): Promise<ChangePlanResultDTO> {
  const storeId = req.store!._id;
  const now = new Date();
  await ensureSubscription(storeId, now);
  const sub = (await Subscription.findOne({ storeId }).lean<SubscriptionLean>())!;
  const current = normalizePlan(req.store!.plan ?? sub.plan);

  if (target === current) {
    if (sub.scheduledChange || (await Invoice.exists({ storeId, kind: 'upgrade', status: 'open' }))) return { ...(await cancelScheduledChange(req)), invoice: null, effective: 'now' as const };
    throw new AppError(409, 'ALREADY_ON_PLAN', 'Your store is already on this plan');
  }

  if (planRank(target) > planRank(current)) {
    const inv = await withTx(async (session) => {
      await lockStoreFinance(storeId, session);
      return createUpgradeInvoice(storeId, target, now, session);
    }).catch((err) => {
      if (isDuplicateKey(err)) throw new AppError(409, 'INVOICE_CHANGED', 'Please try again');
      throw err;
    });
    await audit({ action: 'billing.upgrade_requested', targetType: 'Invoice', targetId: inv._id, meta: { from: current, plan: target, total: inv.total, number: inv.number }, req });
    let settled = false;
    if (inv.total === 0) {
      // Fully covered by credit: activate right away (code review L1: errors surface, side effects run).
      const result = await withTx(async (session) => {
        await lockStoreFinance(storeId, session);
        return addToInvoice(inv._id, {}, now, session);
      });
      await afterSettlement(result, req);
      settled = result.settled;
    }
    return { subscription: await subscriptionDTO(storeId), invoice: invoiceDTO((await Invoice.findById(inv._id).lean<InvoiceLean>())!), effective: settled ? ('now' as const) : ('on_payment' as const) };
  }

  // The period end is read inside the locked transaction so a concurrent renewal can't make it stale (code review L2).
  const effectiveAt = await withTx(async (session) => {
    await lockStoreFinance(storeId, session);
    const fresh = (await Subscription.findOne({ storeId }).session(session).lean<SubscriptionLean>())!;
    await voidOpenUpgrade(storeId, 'cancelled', now, session);
    await Subscription.updateOne(
      { storeId },
      { $set: { scheduledChange: { plan: target, effectiveAt: fresh.currentPeriodEnd, kind: target === 'free' ? 'cancel' : 'downgrade', requestedBy: oid(req.user!.id), requestedAt: now } } },
      { session },
    );
    return fresh.currentPeriodEnd;
  });
  await audit({ action: target === 'free' ? 'billing.cancel_scheduled' : 'billing.downgrade_scheduled', targetType: 'Store', targetId: storeId, meta: { from: current, plan: target, effectiveAt }, req });
  return { subscription: await subscriptionDTO(storeId), invoice: null, effective: 'period_end' as const };
}

export async function cancelScheduledChange(req: Request): Promise<{ subscription: SubscriptionDTO }> {
  const storeId = req.store!._id;
  const now = new Date();
  await ensureSubscription(storeId, now);
  const voided = await withTx(async (session) => {
    await lockStoreFinance(storeId, session);
    const v = await voidOpenUpgrade(storeId, 'cancelled', now, session);
    await Subscription.updateOne({ storeId }, { $set: { scheduledChange: null } }, { session });
    return v;
  });
  await audit({ action: 'billing.scheduled_change_cancelled', targetType: 'Store', targetId: storeId, meta: { voidedInvoice: voided?.number ?? null }, req });
  return { subscription: await subscriptionDTO(storeId) };
}

/** Onboarding: the store starts on Free; a paid choice gets an upgrade invoice right away. */
export async function startSubscription(storeId: Types.ObjectId, chosen: StorePlan | undefined) {
  const now = new Date();
  await ensureSubscription(storeId, now);
  if (!chosen || chosen === 'free') return null;
  return withTx(async (session) => {
    await lockStoreFinance(storeId, session);
    return createUpgradeInvoice(storeId, chosen, now, session);
  });
}

// ---------------- admin actions ----------------
export async function adminSetPlan(req: Request, storeId: Types.ObjectId, plan: StorePlan, reason: string) {
  const now = new Date();
  if (!(await Store.exists({ _id: storeId }))) throw notFound('Store');
  await ensureSubscription(storeId, now);
  const from = await withTx(async (session) => {
    await lockStoreFinance(storeId, session);
    const sub = (await Subscription.findOne({ storeId }).session(session).lean<SubscriptionLean>())!;
    const open = await Invoice.findOne({ storeId, kind: 'upgrade', status: 'open' }).session(session).lean<InvoiceLean>();
    if (open) {
      await BillingPayment.updateMany({ invoiceId: open._id, status: 'pending' }, { $set: { status: 'cancelled', reviewNote: 'Plan changed by Souqly' } }, { session });
      await Invoice.updateOne({ _id: open._id }, { $set: { status: 'void', voidedAt: now, voidReason: 'admin_plan_change' } }, { session });
    }
    await Subscription.updateOne({ storeId }, { $set: { plan, scheduledChange: null } }, { session });
    await Store.updateOne({ _id: storeId }, { $set: { plan } }, { session });
    await BillingAdjustment.create([{ storeId, type: 'plan_change', amount: 0, reason, by: oid(req.user!.id), meta: { from: sub.plan, to: plan } }], { session });
    return sub.plan;
  });
  invalidateStoreIndex();
  await audit({ action: 'admin.billing_plan_changed', targetType: 'Store', targetId: storeId, storeId, meta: { from, plan, reason }, req });
  return subscriptionDTO(storeId);
}

export async function adminExtend(req: Request, storeId: Types.ObjectId, days: number, reason: string) {
  if (!(await Store.exists({ _id: storeId }))) throw notFound('Store');
  await ensureSubscription(storeId);
  await withTx(async (session) => {
    await lockStoreFinance(storeId, session);
    const sub = (await Subscription.findOne({ storeId }).session(session).lean<SubscriptionLean>())!;
    const end = addDays(sub.currentPeriodEnd, days);
    // Re-anchor on the new end date so later periods stay one month long (code review M1).
    await Subscription.updateOne({ storeId }, { $set: { currentPeriodEnd: end, anchorDay: end.getUTCDate(), ...(sub.scheduledChange ? { 'scheduledChange.effectiveAt': end } : {}) } }, { session });
    await BillingAdjustment.create([{ storeId, type: 'extension', amount: 0, reason, by: oid(req.user!.id), meta: { days, from: sub.currentPeriodEnd, to: end } }], { session });
  });
  await audit({ action: 'admin.billing_extended', targetType: 'Store', targetId: storeId, storeId, meta: { days, reason }, req });
  return subscriptionDTO(storeId);
}

export async function adminSuspend(req: Request, storeId: Types.ObjectId, reason: string) {
  if (!(await Store.exists({ _id: storeId }))) throw notFound('Store');
  const changed = await withTx(async (session) => {
    const ok = await suspendForBilling(storeId, { reason: 'admin', note: reason, by: oid(req.user!.id) }, session);
    if (ok) await BillingAdjustment.create([{ storeId, type: 'suspension', amount: 0, reason, by: oid(req.user!.id) }], { session });
    return ok;
  });
  if (!changed) throw new AppError(409, 'ALREADY_SUSPENDED', 'The store is already on an admin billing hold');
  invalidateStoreIndex();
  await audit({ action: 'admin.billing_suspended', targetType: 'Store', targetId: storeId, storeId, meta: { reason }, req });
  const owner = await storeOwner(storeId);
  notifyOwner(owner?.ownerId, 'billing.suspended', 'Store hidden by Souqly billing', `Reason: ${reason}`);
  return subscriptionDTO(storeId);
}

export async function adminReactivate(req: Request, storeId: Types.ObjectId, reason: string) {
  if (!(await Store.exists({ _id: storeId }))) throw notFound('Store');
  const changed = await withTx(async (session) => {
    const r = await Store.updateOne({ _id: storeId, billingStatus: 'suspended' }, { $set: { billingStatus: 'active', billingSuspension: null } }, { session });
    if (r.modifiedCount) await BillingAdjustment.create([{ storeId, type: 'reactivation', amount: 0, reason, by: oid(req.user!.id) }], { session });
    return r.modifiedCount === 1;
  });
  if (!changed) throw new AppError(409, 'NOT_SUSPENDED', 'The store is not suspended for billing');
  invalidateStoreIndex();
  await audit({ action: 'admin.billing_reactivated', targetType: 'Store', targetId: storeId, storeId, meta: { reason }, req });
  const owner = await storeOwner(storeId);
  notifyOwner(owner?.ownerId, 'billing.reactivated', 'Your store is live again', 'Souqly lifted the billing hold on your store.');
  return subscriptionDTO(storeId);
}

export async function adminWaive(req: Request, invoiceId: Types.ObjectId, amount: number | undefined, reason: string) {
  const inv = await Invoice.findById(invoiceId).lean<InvoiceLean>();
  if (!inv) throw notFound('Invoice');
  const waive = amount ?? amountDue(inv);
  if (waive <= 0) throw new AppError(409, 'INVOICE_NOT_PAYABLE', 'Nothing is due on this invoice');
  const now = new Date();
  await ensureSubscription(inv.storeId);
  const r = await withTx(async (session) => {
    await lockStoreFinance(inv.storeId, session);
    const res = await addToInvoice(inv._id, { waived: waive }, now, session);
    await BillingAdjustment.create([{ storeId: inv.storeId, type: 'waiver', invoiceId: inv._id, amount: waive, reason, by: oid(req.user!.id), meta: { number: inv.number } }], { session });
    return res;
  });
  await audit({ action: 'admin.billing_waived', targetType: 'Invoice', targetId: inv._id, storeId: inv.storeId, meta: { amount: waive, reason, number: inv.number }, req });
  await afterSettlement(r, req);
  return invoiceDTO(r.invoice);
}

/** Time budget of one sweep call: Vercel functions stop at 60 s (security review M7, code review M8). */
export const SWEEP_BUDGET_MS = 45_000;

/**
 * Enforcement first, on its own (cron `billing.enforce`, and at the start of every billing sweep): overdue
 * invoices -> billing suspension, expired upgrades -> void. Cheap and bounded, so it can never be starved by
 * the renewal work.
 */
export async function runBillingEnforcement(now = new Date(), budgetMs = SWEEP_BUDGET_MS): Promise<Record<string, number>> {
  return markOverdue(now, Date.now() + budgetMs);
}

/**
 * The daily billing sweep (cron registry + in-process timer). Idempotent; safe to run concurrently with
 * itself. Time-boxed: enforcement runs first, then ended periods are renewed oldest-first until ~45 s have
 * passed; `more: 1` means work is left and the next call (cron / timer) resumes from the oldest remaining
 * period, so no store starves. The legacy-data migration runs on boot (server start and every serverless
 * cold start), not here.
 */
export async function runBillingSweep(now = new Date(), budgetMs = SWEEP_BUDGET_MS): Promise<Record<string, number>> {
  const deadline = Date.now() + budgetMs;
  const enforced = await markOverdue(now, deadline);
  const { syncCommissions } = await import('./commission.service');
  const synced = Date.now() < deadline ? await syncCommissions(undefined, 45, deadline) : { charges: 0, reversals: 0 };
  // Every store gets a subscription (periods drive COD commission invoices even on Free).
  const withSub = await Subscription.distinct('storeId');
  const missing = await Store.find({ status: { $ne: 'rejected' }, _id: { $nin: withSub } }).select('_id').limit(1000).lean();
  for (const s of missing) {
    if (Date.now() > deadline) break;
    await ensureSubscription(s._id, now);
  }
  let issued = 0;
  let advanced = 0;
  let failed = 0;
  let more = enforced.more;
  const rejected = new Set((await Store.find({ status: 'rejected' }).select('_id').lean()).map((s) => String(s._id)));
  // Oldest period end first (fair ordering): a store left over by a timed-out run is first in line next time.
  const due = Subscription.find({ currentPeriodEnd: { $lte: now } }).sort({ currentPeriodEnd: 1, _id: 1 }).select('storeId').lean().cursor();
  for await (const s of due) {
    if (Date.now() > deadline) {
      more = 1;
      break;
    }
    if (rejected.has(String(s.storeId))) continue;
    try {
      // Ledger first (refund debits etc.) so a negative balance is recovered on the invoice.
      await (await import('../finance/finance.service')).reconcileLedger(s.storeId);
      const r = await processStoreCycle(s.storeId, now);
      issued += r.issued;
      advanced += r.advanced;
    } catch (err) {
      failed++;
      logger.error({ err, storeId: String(s.storeId) }, 'Billing renewal failed for store');
    }
  }
  await due.close().catch(() => undefined);
  // Invoices issued above are due no sooner than MIN_NOTICE_DAYS, so a second enforcement pass is not needed.
  return { charges: synced.charges, reversals: synced.reversals, invoicesIssued: issued, periodsAdvanced: advanced, failed, overdue: enforced.overdue, suspended: enforced.suspended, voided: enforced.voided, more };
}

let jobsStarted = false;
/** In-process schedule (local server): the daily billing sweep every 6 h + once shortly after boot. Vercel uses the cron registry. */
export function startBillingJobs(): void {
  if (jobsStarted) return;
  jobsStarted = true;
  const run = async () => {
    const r = await runBillingSweep();
    const { releaseAffiliateCommissions } = await import('../affiliate/affiliate.service');
    const aff = await releaseAffiliateCommissions();
    logger.info({ result: r, affiliate: aff }, 'Billing sweep done');
  };
  getJobs().every('billing.daily', 6 * 3600_000, run);
  const t = setTimeout(() => void run().catch((err) => logger.error({ err }, 'Billing sweep failed')), 20_000);
  t.unref();
}
