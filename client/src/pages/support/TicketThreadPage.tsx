import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMyTicket, useReplyTicket } from '@/api/admin';
import { StatusPill } from '@/components/admin/StatusPill';
import { TicketThread } from '@/components/admin/TicketThread';
import { Seo } from '@/components/layout/Seo';
import { Breadcrumbs, Card, ErrorState, Skeleton } from '@/components/ui';

export default function TicketThreadPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const q = useMyTicket(id);
  const reply = useReplyTicket(id ?? '');
  const tk = q.data;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!tk) return <Skeleton className="h-96" />;
  return (
    <>
      <Seo title={tk.subject} noindex />
      <Breadcrumbs items={[{ label: t('support.title'), to: '/account/support' }, { label: tk.subject }]} className="mb-3 text-xs" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-extrabold text-fg">{tk.subject}</h1>
        <StatusPill status={tk.status} />
      </div>
      <Card>
        <TicketThread
          messages={tk.messages}
          mine="user"
          closed={tk.status === 'closed'}
          sending={reply.isPending}
          onReply={(body) => reply.mutateAsync(body)}
        />
      </Card>
    </>
  );
}
