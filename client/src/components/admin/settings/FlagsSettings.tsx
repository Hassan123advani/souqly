import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FEATURE_FLAGS, type FeatureFlag } from '@souqly/shared';
import { useAdminGet, useAdminMutation } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { Badge, Card, ErrorState, Skeleton, Switch } from '@/components/ui';

/** Feature flag toggles. Each toggle saves immediately (partial PUT merges over stored flags). */
export function FlagsSettings() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useAdminGet<Record<string, boolean>>('settings/feature-flags');
  const put = useAdminMutation('put', ['settings']);
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-96" />;
  const flags = Object.keys(FEATURE_FLAGS) as FeatureFlag[];
  return (
    <Card className="divide-y divide-border">
      {flags.map((f) => {
        const on = q.data[f] ?? FEATURE_FLAGS[f];
        const changed = on !== FEATURE_FLAGS[f];
        return (
          <div key={f} className="flex items-center gap-4 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-fg">
                {t(`admin.flags.${f}.title`, { defaultValue: f })}
                <code className="latin rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-fg-muted">{f}</code>
                {changed && <Badge size="sm" tone="info">{t('admin.settings.overridden')}</Badge>}
              </p>
              <p className="mt-0.5 text-sm text-fg-muted">{t(`admin.flags.${f}.desc`, { defaultValue: '' })}</p>
            </div>
            <Switch
              checked={on}
              disabled={put.isPending}
              label={<span className="sr-only">{f}</span>}
              onCheckedChange={(v) =>
                put.mutate(
                  { path: 'settings/feature-flags', body: { [f]: v } },
                  {
                    onSuccess: () => {
                      toast.success(t(v ? 'admin.settings.flagOn' : 'admin.settings.flagOff', { flag: t(`admin.flags.${f}.title`, { defaultValue: f }) }));
                      void qc.invalidateQueries({ queryKey: ['config'] });
                    },
                    onError: (e) => toast.error(getErrorMessage(e)),
                  },
                )
              }
            />
          </div>
        );
      })}
    </Card>
  );
}
