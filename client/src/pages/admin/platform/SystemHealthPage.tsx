import { useTranslation } from 'react-i18next';
import { Activity, CheckCircle2, Clock, Cpu, Database, RefreshCw, XCircle } from 'lucide-react';
import { useAdminGet, type SystemHealth } from '@/api/admin';
import { KpiCard } from '@/components/admin/KpiCard';
import { PageHeader } from '@/components/admin/PageHeader';
import { Badge, Button, Card, CardHeader, ErrorState, Skeleton } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';

function uptime(s: number) {
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

export default function SystemHealthPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const q = useAdminGet<SystemHealth>('system/health', undefined, { refetchInterval: 30_000 });
  const h = q.data;

  return (
    <>
      <PageHeader
        title={t('admin.nav.system')}
        description={t('admin.system.subtitle')}
        crumbs={[{ label: t('admin.nav.platform') }]}
        actions={
          <Button variant="outline" size="sm" leftIcon={<RefreshCw className={cn('size-4', q.isFetching && 'animate-spin')} />} onClick={() => void q.refetch()}>
            {t('admin.system.refresh')}
          </Button>
        }
      />
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard loading={!h} label={t('admin.system.uptime')} icon={<Clock />} value={h ? uptime(h.uptimeSeconds) : ''} sub={h?.node} />
            <KpiCard loading={!h} label={t('admin.system.memory')} icon={<Cpu />} value={h ? `${h.memory.rssMb} MB` : ''} sub={h ? t('admin.system.heap', { used: h.memory.heapUsedMb, total: h.memory.heapTotalMb }) : undefined} />
            <KpiCard
              loading={!h}
              label={t('admin.system.database')}
              icon={<Database />}
              value={h ? (h.db.status === 'connected' ? t('admin.status.connected') : t('admin.status.disconnected')) : ''}
              sub={h?.db.inMemory ? t('admin.system.inMemory') : undefined}
            />
            <KpiCard loading={!h} label={t('admin.system.jobs')} icon={<Activity />} value={h ? `${h.jobs.completed}` : ''} sub={h ? t('admin.system.jobsSub', { failed: h.jobs.failed, scheduled: h.jobs.scheduled, queue: h.jobs.name }) : undefined} />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title={t('admin.system.integrations')} description={t('admin.system.integrationsHint')} />
              <div className="flex flex-wrap gap-2 p-5">
                {!h
                  ? Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-7 w-28 rounded-pill" />)
                  : Object.entries(h.integrations).map(([k, on]) => (
                      <span key={k} className={cn('inline-flex items-center gap-1.5 rounded-pill border px-3 py-1 text-xs font-semibold', on ? 'border-success/30 bg-success-soft text-success' : 'border-border bg-surface-2 text-fg-muted')}>
                        {on ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
                        {t(`admin.system.keys.${k}`, { defaultValue: k.replace(/^has/, '') })}
                      </span>
                    ))}
              </div>
            </Card>
            <Card>
              <CardHeader title={t('admin.system.collections')} />
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 p-5 text-sm sm:grid-cols-3">
                {!h
                  ? Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="h-5" />)
                  : Object.entries(h.db.collections)
                      .sort((a, b) => b[1] - a[1])
                      .map(([name, n]) => (
                        <div key={name} className="flex justify-between gap-2">
                          <span className="latin truncate text-fg-muted">{name}</span>
                          <span className="tabular font-semibold">{n}</span>
                        </div>
                      ))}
              </div>
            </Card>
          </div>
          <Card className="mt-4">
            <CardHeader title={t('admin.system.recentErrors')} action={h && <Badge tone={h.recentErrors.length ? 'danger' : 'success'}>{h.recentErrors.length}</Badge>} />
            {!h ? (
              <Skeleton className="mx-5 mb-5 h-32" />
            ) : !h.recentErrors.length ? (
              <p className="flex items-center gap-2 p-5 text-sm text-success">
                <CheckCircle2 className="size-4" />
                {t('admin.system.noErrors')}
              </p>
            ) : (
              <div className="max-h-96 overflow-auto border-t border-border">
                <table className="w-full text-xs" dir="ltr">
                  <tbody className="divide-y divide-border">
                    {h.recentErrors.map((e, i) => (
                      <tr key={i} className="latin">
                        <td className="whitespace-nowrap px-4 py-2 text-fg-muted">{formatRelative(e.at, lang)}</td>
                        <td className="px-2 py-2">
                          <Badge size="sm" tone={e.status >= 500 ? 'danger' : 'warning'}>
                            {e.status}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 font-mono font-semibold">
                          {e.method} {e.path}
                        </td>
                        <td className="px-2 py-2 font-mono text-fg-muted">{e.code}</td>
                        <td className="px-4 py-2 text-fg-muted">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
