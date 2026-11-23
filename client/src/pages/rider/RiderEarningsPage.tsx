import { useTranslation } from 'react-i18next';
import { Store } from 'lucide-react';
import { Card } from '@/components/ui';
import { useRider } from '@/components/rider/RiderLayout';
import { money } from '@/lib/format';

export default function RiderEarningsPage() {
  const { t } = useTranslation();
  const me = useRider();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold text-fg">{t('rider.earnings.title')}</h1>
      <div className="grid grid-cols-2 gap-3">
        <section className="rounded-xl bg-gradient-to-br from-primary-700 to-primary-900 p-4 text-white shadow-pop">
          <p className="text-xs font-semibold text-white/80">{t('rider.earnings.today')}</p>
          <p className="latin mt-1 text-2xl font-extrabold tabular" dir="ltr">
            {money(me.stats.earningsToday)}
          </p>
          <p className="mt-1 text-[11px] text-white/75">{t('rider.earnings.deliveriesToday', { count: me.stats.todayDeliveries })}</p>
        </section>
        <Card className="p-4">
          <p className="text-xs font-semibold text-fg-muted">{t('rider.earnings.total')}</p>
          <p className="latin mt-1 text-2xl font-extrabold tabular text-fg" dir="ltr">
            {money(me.stats.earningsTotal)}
          </p>
        </Card>
      </div>
      <Card className="p-0">
        <h2 className="border-b border-border px-4 py-3 text-sm font-bold text-fg">{t('rider.earnings.rates')}</h2>
        <ul className="divide-y divide-border">
          {me.stores.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3">
              <Store className="size-5 shrink-0 text-primary-700" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{s.name}</span>
              <span className="text-sm text-fg-muted">
                <span className="latin font-extrabold tabular text-fg" dir="ltr">
                  {money(s.riderFee)}
                </span>{' '}
                {t('rider.earnings.perDelivery')}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <p className="text-xs text-fg-muted">{t('rider.earnings.note')}</p>
    </div>
  );
}
