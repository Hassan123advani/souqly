import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bike, CalendarClock, History } from 'lucide-react';
import { useRiderDeliveries, type RiderRange } from '@/api/delivery';
import { Button, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { DeliveryCard } from '@/components/rider/DeliveryCard';
import { useRider } from '@/components/rider/RiderLayout';
import { PillTabs } from '@/components/returns/PillTabs';
import { money } from '@/lib/format';

const RANGES: RiderRange[] = ['today', 'upcoming', 'history'];
const EMPTY_ICON = { today: Bike, upcoming: CalendarClock, history: History };

export default function RiderHomePage() {
  const { t } = useTranslation();
  const me = useRider();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as RiderRange | null;
  const range: RiderRange = raw && RANGES.includes(raw) ? raw : 'today';
  const q = useRiderDeliveries(range);
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
  const Empty = EMPTY_ICON[range];

  return (
    <div className="space-y-4">
      <section aria-labelledby="rider-today" className="rounded-xl bg-gradient-to-br from-primary-800 to-primary-950 p-4 text-white shadow-pop">
        <h1 id="rider-today" className="text-sm font-semibold text-white/80">
          {t('rider.hello', { name: me.user.name.split(' ')[0] })}
        </h1>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            [t('rider.stats.deliveries'), String(me.stats.todayDeliveries)],
            [t('rider.stats.cod'), money(me.stats.codCollectedToday)],
            [t('rider.stats.earnings'), money(me.stats.earningsToday)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-white/10 px-2 py-2.5">
              <p className="latin truncate text-base font-extrabold tabular" dir="ltr">
                {value}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-white/75">{label}</p>
            </div>
          ))}
        </div>
        {me.stats.codOutstanding > 0 && (
          <p className="mt-3 rounded-md bg-accent/20 px-3 py-2 text-xs font-semibold text-accent-100">
            {t('rider.handOverHint', { amount: money(me.stats.codOutstanding) })}
          </p>
        )}
      </section>

      <PillTabs<RiderRange>
        size="lg"
        label={t('rider.deliveries')}
        value={range}
        onChange={(k) => setParams(k === 'today' ? {} : { tab: k }, { replace: true })}
        tabs={RANGES.map((k) => ({ key: k, label: t(`rider.tabs.${k}`) }))}
      />

      <div role="tabpanel" className="space-y-3">
        {q.isPending ? (
          [0, 1, 2].map((k) => <Skeleton key={k} className="h-32 w-full rounded-lg" />)
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : !rows.length ? (
          <EmptyState icon={<Empty />} title={t(`rider.empty.${range}`)} description={t('rider.emptyBody')} />
        ) : (
          rows.map((d) => <DeliveryCard key={d.orderId} d={d} />)
        )}
        {q.hasNextPage && (
          <Button block variant="outline" size="lg" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
            {t('rider.loadMore')}
          </Button>
        )}
      </div>
    </div>
  );
}
