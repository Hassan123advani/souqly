import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ExternalLink, FileText, Plus } from 'lucide-react';
import { useAdminGet, type CmsPage } from '@/api/admin';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatusPill } from '@/components/admin/StatusPill';
import { Button, IconButton } from '@/components/ui';
import { useLang, useLocalized } from '@/lib/catalog';
import { formatDateTime } from '@/lib/format';

export default function CmsPagesPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const loc = useLocalized();
  const nav = useNavigate();
  const q = useAdminGet<CmsPage[]>('pages');

  const columns: Column<CmsPage>[] = [
    {
      key: 'title',
      header: t('admin.cms.pageTitle'),
      cell: (p) => (
        <div>
          <p className="font-semibold text-fg">{loc(p.title)}</p>
          <p className="text-xs text-fg-muted" dir="ltr">
            /pages/{p.slug}
          </p>
        </div>
      ),
    },
    { key: 'langs', header: t('admin.cms.languages'), cell: (p) => <span className="latin text-xs font-semibold text-fg-muted">{(['en', 'ur', 'ar'] as const).filter((l) => p.body[l]?.trim()).join(' · ').toUpperCase() || '—'}</span> },
    { key: 'status', header: t('admin.common.status'), cell: (p) => <StatusPill status={p.published ? 'published' : 'draft'} /> },
    { key: 'updated', header: t('admin.cms.updated'), cell: (p) => <span className="text-fg-muted">{p.updatedAt ? formatDateTime(p.updatedAt, lang) : '—'}</span> },
    {
      key: 'view',
      header: '',
      align: 'end',
      cell: (p) =>
        p.published ? (
          <IconButton size="sm" variant="ghost" label={t('admin.cms.viewSite')} href={`/pages/${p.slug}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
            <ExternalLink className="size-4" />
          </IconButton>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title={t('admin.nav.pages')}
        description={t('admin.cms.pagesSub')}
        crumbs={[{ label: t('admin.nav.content') }]}
        actions={
          <Button size="sm" to="/admin/cms/pages/new" leftIcon={<Plus className="size-4" />}>
            {t('admin.cms.newPage')}
          </Button>
        }
      />
      <DataTable
        rows={q.data ?? []}
        columns={columns}
        rowKey={(p) => p.id}
        isLoading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        onRowClick={(p) => nav(`/admin/cms/pages/${p.id}`)}
        empty={{ title: t('admin.cms.noPages'), description: t('admin.cms.noPagesBody'), icon: <FileText /> }}
      />
    </>
  );
}
