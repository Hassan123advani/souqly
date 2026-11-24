import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Lock, Percent } from 'lucide-react';
import { PLATFORM_COMMISSION_BPS, type CategoryNode } from '@souqly/shared';
import { useAdminGet, type CommissionRule } from '@/api/admin';
import { useCategoryTree } from '@/api/catalog';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { PageHeader } from '@/components/admin/PageHeader';
import { Alert, Badge, Card } from '@/components/ui';
import { useLocalized } from '@/lib/catalog';

function flatten(nodes: CategoryNode[]): { id: string; name: CategoryNode['name'] }[] {
  return nodes.flatMap((n) => [{ id: n.id, name: n.name }, ...flatten(n.children ?? [])]);
}

/**
 * Commission is a flat platform rate for every plan (docs/api-billing.md §2). The old rules engine is
 * retired: rules are kept for history and shown read-only; the API answers 409 COMMISSION_FIXED to edits.
 */
export default function CommissionPage() {
  const { t } = useTranslation();
  const loc = useLocalized();
  const q = useAdminGet<CommissionRule[]>('commission-rules');
  const tree = useCategoryTree();
  const cats = useMemo(() => flatten(tree.data ?? []), [tree.data]);
  const pct = PLATFORM_COMMISSION_BPS / 100;
  const catName = (id: string | null) => {
    const c = cats.find((x) => x.id === id);
    return c ? loc(c.name) : `#${id?.slice(-6)}`;
  };

  const columns: Column<CommissionRule>[] = [
    { key: 'scope', header: t('admin.finance.scope'), cell: (r) => <Badge tone="neutral" size="sm">{t(`admin.finance.scopes.${r.scope}`)}</Badge> },
    {
      key: 'target',
      header: t('admin.finance.target'),
      cell: (r) =>
        r.scope === 'global' ? (
          <span className="text-fg-muted">{t('admin.finance.allSales')}</span>
        ) : r.scope === 'category' ? (
          catName(r.categoryId)
        ) : (
          <Link to={`/admin/stores/${r.storeId}`} className="font-semibold text-primary-700 hover:underline">
            {t('admin.finance.storeN', { id: r.storeId?.slice(-6) })}
          </Link>
        ),
    },
    { key: 'rate', header: t('admin.finance.rate'), cell: (r) => <span className="text-fg-muted line-through">{(r.bps / 100).toFixed(1)}%</span> },
    { key: 'state', header: t('admin.common.status'), cell: () => <Badge tone="neutral" size="sm">{t('billing.admin.commission.retired')}</Badge> },
  ];

  return (
    <>
      <PageHeader title={t('billing.admin.nav.commission')} description={t('billing.admin.commission.subtitle')} crumbs={[{ label: t('admin.nav.finance') }]} />
      <Card className="mb-4 flex flex-wrap items-center gap-4 p-5">
        <span className="grid size-14 place-items-center rounded-lg bg-primary-50 text-primary-700">
          <Percent className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{t('billing.admin.commission.fixedLabel')}</p>
          <p className="text-3xl font-extrabold text-fg" dir="ltr">
            {pct}%
          </p>
          <p className="text-sm text-fg-muted">{t('billing.admin.commission.fixedBody', { pct })}</p>
        </div>
        <Badge tone="primary">
          <Lock className="size-3.5" aria-hidden /> {t('billing.admin.commission.locked')}
        </Badge>
      </Card>
      <Alert tone="info" className="mb-4" title={t('billing.admin.commission.legacyTitle')}>
        {t('billing.admin.commission.legacyBody')}
      </Alert>
      <DataTable rows={q.data ?? []} columns={columns} rowKey={(r) => r.id} isLoading={q.isLoading} error={q.error} onRetry={() => void q.refetch()} empty={{ title: t('admin.finance.noRules'), icon: <Percent /> }} />
    </>
  );
}
