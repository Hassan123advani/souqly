import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, LifeBuoy, Plus } from 'lucide-react';
import { useMyTickets } from '@/api/admin';
import { StatusPill } from '@/components/admin/StatusPill';
import { Seo } from '@/components/layout/Seo';
import { Button, Card, EmptyState, ErrorState, LoadMore, SectionHeader, Skeleton } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { formatRelative } from '@/lib/format';

export default function SupportTicketsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const list = useMyTickets();
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <>
      <Seo title={t('support.title')} noindex />
      <SectionHeader
        as="h1"
        title={t('support.title')}
        description={t('support.subtitle')}
        action={
          <Button to="/account/support/new" size="sm" leftIcon={<Plus className="size-4" />}>
            {t('support.new')}
          </Button>
        }
      />
      {list.error ? (
        <Card>
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        </Card>
      ) : list.isLoading ? (
        <div className="grid gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : !rows.length ? (
        <Card>
          <EmptyState
            icon={<LifeBuoy />}
            title={t('support.empty')}
            description={t('support.emptyBody')}
            action={
              <Button to="/account/support/new" leftIcon={<Plus className="size-4" />}>
                {t('support.new')}
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {rows.map((tk) => (
              <li key={tk.id}>
                <Link to={`/account/support/${tk.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold text-fg">
                      {tk.lastSide === 'staff' && tk.status !== 'closed' && <span className="size-2 shrink-0 rounded-full bg-accent" aria-label={t('support.newReply')} />}
                      {tk.subject}
                    </p>
                    <p className="mt-0.5 text-xs text-fg-muted">
                      {t(`support.categories.${tk.category}`)} · {tk.lastMessageAt ? formatRelative(tk.lastMessageAt, lang) : ''}
                    </p>
                  </div>
                  <StatusPill status={tk.status} />
                  <ChevronRight className="flip-rtl size-4 text-fg-subtle" />
                </Link>
              </li>
            ))}
          </ul>
          <LoadMore hasMore={!!list.hasNextPage} loading={list.isFetchingNextPage} onLoadMore={() => void list.fetchNextPage()} />
        </Card>
      )}
    </>
  );
}
