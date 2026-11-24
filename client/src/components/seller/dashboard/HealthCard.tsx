import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Lightbulb, RefreshCw } from 'lucide-react';
import { getErrorMessage } from '@/api/client';
import { useRecomputeHealth, useStoreHealth, type StoreHealth } from '@/api/growth';
import { Card, CardHeader, ErrorState, IconButton, Skeleton } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { formatRelative } from '@/lib/format';
import { HealthGauge } from './HealthGauge';

/** Below these factor values (0..1) a translated tip is shown (mirrors the server's thresholds). */
const TIP_BELOW: Record<string, number> = {
  fulfilmentRate: 0.9,
  onTimeShipRate: 0.85,
  cancellationRate: 0.95,
  returnRate: 0.8,
  rating: 0.8,
  chatResponse: 0.8,
  policyCompleteness: 1,
};

/** Translated tips derived from the factor values (server recommendations are English-only). */
export function healthTips(h: Pick<StoreHealth, 'factors'>): string[] {
  return [...h.factors]
    .filter((f) => TIP_BELOW[f.key] !== undefined && f.value < TIP_BELOW[f.key]!)
    .sort((a, b) => a.value * a.weight - b.value * b.weight)
    .map((f) => f.key);
}

/** Store health score card for the seller dashboard (`GET /seller/health`, on-demand recompute). */
export function HealthCard() {
  const { t } = useTranslation();
  const lang = useLang();
  const q = useStoreHealth();
  const recompute = useRecomputeHealth();
  const tips = q.data ? healthTips(q.data) : [];
  return (
    <Card>
      <CardHeader
        title={t('seller.dash.health')}
        description={q.data ? t('growth.health.updated', { when: formatRelative(q.data.computedAt, lang) }) : t('seller.dash.healthHint')}
        action={
          <IconButton
            label={t('growth.health.recompute')}
            size="sm"
            variant="ghost"
            loading={recompute.isPending}
            disabled={!q.data}
            onClick={() =>
              recompute.mutate(undefined, {
                onSuccess: () => toast.success(t('growth.health.recomputed')),
                onError: (e) => toast.error(getErrorMessage(e)),
              })
            }
          >
            <RefreshCw className="size-4" />
          </IconButton>
        }
      />
      <div className="grid gap-5 p-5">
        {q.error ? (
          <ErrorState compact error={q.error} onRetry={() => void q.refetch()} />
        ) : !q.data ? (
          <>
            <Skeleton className="mx-auto h-28 w-48" />
            <Skeleton className="h-40" />
          </>
        ) : (
          <>
            <HealthGauge health={q.data} />
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg">
                <Lightbulb className="size-4 text-accent-700" /> {t('growth.health.tipsTitle')}
              </p>
              {tips.length ? (
                <ul className="grid gap-1.5 text-sm text-fg-muted">
                  {tips.map((k) => (
                    <li key={k} className="flex gap-2">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                      <span>{t(`growth.health.tips.${k}`)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-fg-muted">{t('growth.health.allGood')}</p>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
