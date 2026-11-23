import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarCheck, Check, Coins, Gift } from 'lucide-react';
import { LOYALTY } from '@souqly/shared';
import { useFlag } from '@/api/config';
import { useCheckIn, useCheckInStatus, useCoins } from '@/api/wallet';
import { Seo } from '@/components/layout/Seo';
import { socialError } from '@/components/social/errors';
import { TxList } from '@/components/wallet/TxList';
import { Button, Card, ErrorState, SectionHeader, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';

const coinsFmt = (n: number) => n.toLocaleString('en');

/** Daily check-in card: a 7-day streak strip with the bonus on day 7. */
function CheckInCard() {
  const { t } = useTranslation();
  const status = useCheckInStatus();
  const checkIn = useCheckIn();
  if (status.isPending) return <Skeleton className="h-44 w-full rounded-lg" />;
  if (status.isError) return <ErrorState error={status.error} onRetry={() => void status.refetch()} compact />;
  const s = status.data;
  const L = LOYALTY.STREAK_LENGTH;
  // Days already done in the current 7-day cycle.
  const done = s.checkedInToday ? ((s.streak - 1) % L) + 1 : s.streak % L;
  const today = s.checkedInToday ? done - 1 : done;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-accent-50/60 px-4 py-3 sm:px-5">
        <CalendarCheck className="size-5 text-accent-700" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-fg">{t('wallet.checkIn.title')}</h2>
          <p className="text-xs text-fg-muted">{t('wallet.checkIn.streak', { n: s.streak })}</p>
        </div>
        <Button
          variant="accent"
          disabled={s.checkedInToday}
          loading={checkIn.isPending}
          onClick={() =>
            checkIn.mutate(undefined, {
              onSuccess: (r) => toast.success(t('wallet.checkIn.earned', { n: r.coins })),
              onError: (e) => toast.error(socialError(e)),
            })
          }
        >
          {s.checkedInToday ? t('wallet.checkIn.done') : t('wallet.checkIn.cta', { n: s.nextReward })}
        </Button>
      </div>
      <ol className="grid grid-cols-7 gap-1.5 p-4 sm:gap-3 sm:p-5">
        {Array.from({ length: L }, (_, i) => {
          const isDone = i < done;
          const isToday = i === today;
          const bonus = i === L - 1;
          const reward = LOYALTY.CHECK_IN_COINS + (bonus ? LOYALTY.STREAK_BONUS_COINS : 0);
          return (
            <li
              key={i}
              aria-current={isToday ? 'step' : undefined}
              className={cn(
                'flex flex-col items-center gap-1 rounded-md border px-1 py-2 text-center',
                isDone ? 'border-success/30 bg-success-soft' : isToday ? 'border-accent bg-accent-50 ring-2 ring-accent/40' : 'border-border bg-surface',
              )}
            >
              <span className="text-[10px] font-semibold text-fg-muted sm:text-xs">{t('wallet.checkIn.day', { n: i + 1 })}</span>
              <span
                className={cn(
                  'grid size-8 place-items-center rounded-full sm:size-10',
                  isDone ? 'bg-success text-white' : bonus ? 'bg-sale text-white' : 'bg-accent text-accent-fg',
                )}
              >
                {isDone ? <Check className="size-4" aria-hidden /> : bonus ? <Gift className="size-4" aria-hidden /> : <Coins className="size-4" aria-hidden />}
              </span>
              <span className="latin text-[11px] font-bold text-fg tabular sm:text-xs">+{reward}</span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/** `/account/coins`: balance, daily check-in, history. */
export default function CoinsPage() {
  const { t } = useTranslation();
  const checkInOn = useFlag('dailyCheckIn');
  const q = useCoins();
  const first = q.data?.pages[0]?.data;
  const rows = q.data?.pages.flatMap((p) => p.data.history) ?? [];
  return (
    <div className="space-y-5">
      <Seo title={t('wallet.coins.title')} noindex />
      <SectionHeader as="h2" title={t('wallet.coins.title')} />
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 p-5 text-accent-fg shadow-card sm:p-6 rtl:bg-gradient-to-bl">
        <Coins className="absolute -bottom-4 end-2 size-28 opacity-15" aria-hidden />
        <p className="text-sm font-semibold opacity-80">{t('wallet.coins.balance')}</p>
        {q.isPending ? (
          <Skeleton className="mt-2 h-10 w-32 bg-white/30" />
        ) : first ? (
          <>
            <p className="latin mt-1 text-4xl font-extrabold tracking-tight tabular">{coinsFmt(first.balance)}</p>
            <p className="mt-1 text-sm font-semibold">{t('wallet.coins.worth', { v: money(first.worth) })}</p>
          </>
        ) : null}
        <p className="mt-2 max-w-md text-xs opacity-80">{t('wallet.coins.hint')}</p>
      </div>
      {checkInOn && <CheckInCard />}
      <Card>
        <h2 className="border-b border-border px-4 py-3 font-bold text-fg sm:px-5">{t('wallet.coins.history')}</h2>
        <TxList
          rows={rows}
          format={coinsFmt}
          pending={q.isPending}
          error={q.error}
          onRetry={() => void q.refetch()}
          hasMore={!!q.hasNextPage}
          loadingMore={q.isFetchingNextPage}
          onMore={() => void q.fetchNextPage()}
        />
      </Card>
    </div>
  );
}
