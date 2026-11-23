import { useTranslation } from 'react-i18next';
import { ArrowDownLeft, ArrowUpRight, HandCoins } from 'lucide-react';
import { useRiderCod } from '@/api/delivery';
import { Card, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDateTime, money } from '@/lib/format';
import { useUi } from '@/stores/ui';

export default function RiderCashPage() {
  const { t } = useTranslation();
  const lang = useUi((s) => s.language);
  const q = useRiderCod();

  if (q.isPending)
    return (
      <div className="space-y-3" aria-busy>
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;

  const { stores, entries } = q.data;
  const total = stores.reduce((n, s) => n + s.outstanding, 0);
  const storeName = new Map(stores.map((s) => [s.storeId, s.storeName]));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold text-fg">{t('rider.cash.title')}</h1>
      <section className="rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 p-5 text-ink-950 shadow-pop">
        <p className="text-sm font-semibold opacity-80">{t('rider.cash.toHandOver')}</p>
        <p className="latin mt-1 text-4xl font-extrabold tabular" dir="ltr">
          {money(total)}
        </p>
        <p className="mt-2 text-xs font-medium opacity-80">{t('rider.cash.hint')}</p>
      </section>

      {stores.length > 0 && (
        <Card className="divide-y divide-border p-0">
          {stores.map((s) => (
            <div key={s.storeId} className="grid grid-cols-3 gap-2 p-4 text-center">
              <p className="col-span-3 text-start text-sm font-bold text-fg">{s.storeName}</p>
              {[
                [t('rider.cash.collected'), s.collected],
                [t('rider.cash.settled'), s.settled],
                [t('rider.cash.outstanding'), s.outstanding],
              ].map(([label, v]) => (
                <div key={label as string} className="rounded-md bg-surface-2 px-2 py-2">
                  <p className="text-[11px] text-fg-muted">{label}</p>
                  <p className="latin text-sm font-extrabold tabular text-fg" dir="ltr">
                    {money(v as number)}
                  </p>
                </div>
              ))}
            </div>
          ))}
        </Card>
      )}

      <h2 className="pt-2 text-sm font-bold text-fg">{t('rider.cash.ledger')}</h2>
      {!entries.length ? (
        <EmptyState compact icon={<HandCoins />} title={t('rider.cash.empty')} description={t('rider.cash.emptyBody')} />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-border">
            {entries.map((e) => {
              const In = e.type === 'collected';
              return (
                <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={cn('grid size-10 shrink-0 place-items-center rounded-pill', In ? 'bg-accent-50 text-accent-800' : 'bg-success-soft text-success')} aria-hidden>
                    {In ? <ArrowDownLeft className="size-5" /> : <ArrowUpRight className="size-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-fg">
                      {In ? t('rider.cash.entryCollected') : t('rider.cash.entrySettled')}
                      {e.orderNumber && (
                        <span className="latin ms-1.5 text-xs font-medium text-fg-muted" dir="ltr">
                          {e.orderNumber}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-fg-subtle">
                      {storeName.get(e.storeId) ?? ''} · {formatDateTime(e.at, lang)}
                    </p>
                  </div>
                  <span className={cn('latin text-sm font-extrabold tabular', In ? 'text-fg' : 'text-success')} dir="ltr">
                    {In ? '+' : '−'}
                    {money(e.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
