import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Receipt } from 'lucide-react';
import type { CommissionEntry, Invoice, InvoicePayment } from '@/api/billing';
import { Card, CardHeader, EmptyState } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime, money } from '@/lib/format';
import { BillingBadge, usePlanName } from './BillingBadge';

const Amount = ({ v, className }: { v: number; className?: string }) => (
  <span className={cn('tabular whitespace-nowrap', v < 0 && 'text-success', className)} dir="ltr">
    {money(v)}
  </span>
);

/** Key facts of an invoice: plan, period, issue / due / paid dates. */
export function InvoiceFacts({ invoice, extra }: { invoice: Invoice; extra?: ReactNode }) {
  const { t } = useTranslation();
  const lang = useLang();
  const planName = usePlanName();
  const rows: [string, ReactNode][] = [
    [t('billing.invoice.kind'), t(`billing.kind.${invoice.kind}`)],
    [t('billing.invoice.plan'), planName(invoice.plan)],
    [t('billing.invoice.period'), `${formatDate(invoice.periodStart, lang)} – ${formatDate(invoice.periodEnd, lang)}`],
    [t('billing.invoice.issued'), formatDate(invoice.issuedAt, lang)],
    [t('billing.invoice.due'), formatDate(invoice.dueDate, lang)],
  ];
  if (invoice.paidAt) rows.push([t('billing.invoice.paidAt'), formatDateTime(invoice.paidAt, lang)]);
  if (invoice.voidedAt) rows.push([t('billing.invoice.voidedAt'), `${formatDate(invoice.voidedAt, lang)}${invoice.voidReason ? ` · ${t(`billing.voidReason.${invoice.voidReason}`, { defaultValue: invoice.voidReason })}` : ''}`]);
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-border/60 pb-2">
          <dt className="text-fg-muted">{k}</dt>
          <dd className="text-end font-semibold text-fg">{v}</dd>
        </div>
      ))}
      {extra}
    </dl>
  );
}

/** Invoice lines (subscription fee and COD commission separately) with totals. */
export function InvoiceLines({ invoice }: { invoice: Invoice }) {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <Card className="overflow-hidden">
      <CardHeader title={t('billing.invoice.lines')} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="bg-surface-2/60 text-[11px] font-bold uppercase tracking-wide text-fg-muted">
              <th scope="col" className="px-5 py-2.5 text-start">{t('billing.invoice.item')}</th>
              <th scope="col" className="px-5 py-2.5 text-start">{t('billing.invoice.details')}</th>
              <th scope="col" className="px-5 py-2.5 text-end">{t('billing.invoice.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-5 py-3 align-top">
                  <p className="font-semibold text-fg">{t(`billing.lineType.${l.type}`)}</p>
                  <p className="text-xs text-fg-muted">{l.description}</p>
                </td>
                <td className="px-5 py-3 align-top text-xs text-fg-muted">
                  {l.periodStart && l.periodEnd && <p>{`${formatDate(l.periodStart, lang)} – ${formatDate(l.periodEnd, lang)}`}</p>}
                  {l.entries !== undefined && <p>{t('billing.invoice.entries', { n: l.entries })}</p>}
                </td>
                <td className="px-5 py-3 text-end align-top font-semibold">
                  <Amount v={l.amount} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-border text-sm">
            <tr>
              <td colSpan={2} className="px-5 pt-3 text-end text-fg-muted">{t('billing.invoice.total')}</td>
              <td className="px-5 pt-3 text-end font-bold"><Amount v={invoice.total} /></td>
            </tr>
            {invoice.amountPaid > 0 && (
              <tr>
                <td colSpan={2} className="px-5 pt-1 text-end text-fg-muted">{t('billing.invoice.amountPaid')}</td>
                <td className="px-5 pt-1 text-end"><Amount v={-invoice.amountPaid} /></td>
              </tr>
            )}
            {invoice.amountWaived > 0 && (
              <tr>
                <td colSpan={2} className="px-5 pt-1 text-end text-fg-muted">{t('billing.invoice.amountWaived')}</td>
                <td className="px-5 pt-1 text-end"><Amount v={-invoice.amountWaived} /></td>
              </tr>
            )}
            <tr>
              <td colSpan={2} className="px-5 pb-4 pt-2 text-end font-bold text-fg">{t('billing.invoice.amountDue')}</td>
              <td className="px-5 pb-4 pt-2 text-end text-lg font-extrabold text-fg"><Amount v={invoice.amountDue} /></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

/** Commission entries linked to an invoice (or any commission list). */
export function CommissionTable({ entries, orderHref, invoiceHref, title }: { entries: CommissionEntry[]; orderHref?: (e: CommissionEntry) => string; invoiceHref?: (e: CommissionEntry) => string; title?: string }) {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <Card className="overflow-hidden">
      <CardHeader title={title ?? t('billing.invoice.commissions')} description={t('billing.commissions.basis')} />
      {entries.length === 0 ? (
        <EmptyState compact icon={<Receipt />} title={t('billing.commissions.empty')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="bg-surface-2/60 text-[11px] font-bold uppercase tracking-wide text-fg-muted">
                <th scope="col" className="px-4 py-2.5 text-start">{t('billing.commissions.date')}</th>
                <th scope="col" className="px-4 py-2.5 text-start">{t('billing.commissions.order')}</th>
                <th scope="col" className="px-4 py-2.5 text-start">{t('billing.commissions.channel')}</th>
                <th scope="col" className="px-4 py-2.5 text-end">{t('billing.commissions.base')}</th>
                <th scope="col" className="px-4 py-2.5 text-end">{t('billing.commissions.amount')}</th>
                <th scope="col" className="px-4 py-2.5 text-start">{t('billing.commissions.status')}</th>
                {invoiceHref && <th scope="col" className="px-4 py-2.5 text-start">{t('billing.commissions.invoice')}</th>}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="whitespace-nowrap px-4 py-2.5 text-fg-muted">{formatDate(e.at, lang)}</td>
                  <td className="px-4 py-2.5">
                    {orderHref ? (
                      <Link to={orderHref(e)} className="latin font-semibold text-primary-700 hover:underline">
                        {e.orderNumber}
                      </Link>
                    ) : (
                      <span className="latin font-semibold">{e.orderNumber}</span>
                    )}
                    <p className="text-xs text-fg-muted">
                      {t(`billing.entryKind.${e.kind}`)} · {t(`billing.reason.${e.reason}`)}
                    </p>
                  </td>
                  <td className="px-4 py-2.5">{t(`billing.channel.${e.channel}`)}</td>
                  <td className="px-4 py-2.5 text-end"><Amount v={e.base} /></td>
                  <td className="px-4 py-2.5 text-end font-semibold"><Amount v={e.amount} /></td>
                  <td className="px-4 py-2.5"><BillingBadge status={e.status} /></td>
                  {invoiceHref && (
                    <td className="px-4 py-2.5">
                      {e.invoiceId ? (
                        <Link to={invoiceHref(e)} className="latin text-xs font-semibold text-primary-700 hover:underline">
                          {e.invoiceNumber ?? e.invoiceId.slice(-6)}
                        </Link>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Payment attempts on an invoice (balance / manual transfer / gateway / admin). */
export function PaymentList({ payments, title }: { payments: InvoicePayment[]; title?: string }) {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <Card className="overflow-hidden">
      <CardHeader title={title ?? t('billing.invoice.payments')} />
      {payments.length === 0 ? (
        <EmptyState compact icon={<FileText />} title={t('billing.payments.empty')} />
      ) : (
        <ul className="divide-y divide-border">
          {payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold text-fg">
                  {t(`billing.method.${p.method}`)}
                  {p.channel && <span className="font-normal text-fg-muted"> · {t(`billing.channel.${p.channel}`)}</span>}
                </p>
                <p className="text-xs text-fg-muted">
                  {formatDateTime(p.createdAt, lang)}
                  {p.reference && (
                    <>
                      {' · '}
                      <span className="latin font-mono">{p.reference}</span>
                    </>
                  )}
                </p>
                {p.proofUrl && (
                  <a href={p.proofUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary-700 hover:underline">
                    {t('billing.payments.viewProof')}
                  </a>
                )}
                {p.reviewNote && <p className="mt-1 text-xs text-fg-muted">{t('billing.payments.reviewNote', { note: p.reviewNote })}</p>}
              </div>
              <div className="flex flex-col items-end gap-1">
                <Amount v={p.amount} className="font-bold" />
                <BillingBadge status={p.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
