import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { UserCheck, UserMinus } from 'lucide-react';
import { useMe } from '@/api/auth';
import { useAdminGet, useAdminMutation, type TicketDetail } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { PageHeader } from '@/components/admin/PageHeader';
import { StatusPill } from '@/components/admin/StatusPill';
import { TicketThread } from '@/components/admin/TicketThread';
import { Button, Card, CardHeader, ErrorState, FormField, Select, Skeleton } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { formatDateTime } from '@/lib/format';

export default function TicketDetailPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const lang = useLang();
  const { data: me } = useMe();
  const q = useAdminGet<TicketDetail>(`tickets/${id}`, undefined, { refetchInterval: 30_000 });
  const reply = useAdminMutation('post', ['tickets']);
  const patch = useAdminMutation('patch', ['tickets']);
  const assign = useAdminMutation('post', ['tickets']);
  const tk = q.data;
  const fail = (e: unknown) => toast.error(getErrorMessage(e));

  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!tk)
    return (
      <div className="grid gap-4">
        <Skeleton className="h-16 w-1/2" />
        <Skeleton className="h-96" />
      </div>
    );
  const mine = tk.assigneeId === me?.id;

  return (
    <>
      <PageHeader
        title={tk.subject}
        crumbs={[{ label: t('admin.nav.support'), to: '/admin/support' }]}
        actions={
          <Button
            size="sm"
            variant="outline"
            loading={assign.isPending}
            leftIcon={mine ? <UserMinus className="size-4" /> : <UserCheck className="size-4" />}
            onClick={() => assign.mutate({ path: `tickets/${id}/assign`, body: { assigneeId: mine ? null : me?.id } }, { onSuccess: () => toast.success(t('admin.common.saved')), onError: fail })}
          >
            {mine ? t('admin.support.unassign') : t('admin.support.assignMe')}
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card>
          <CardHeader title={t('admin.support.conversation')} action={<StatusPill status={tk.status} />} />
          <div className="border-t border-border">
            <TicketThread
              messages={tk.messages}
              mine="staff"
              sending={reply.isPending}
              onReply={(body) => reply.mutateAsync({ path: `tickets/${id}/reply`, body: { body } })}
            />
          </div>
        </Card>
        <Card className="grid content-start gap-4 p-5 text-sm">
          {tk.user && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">{t('admin.support.customer')}</p>
              <Link to={`/admin/users/${tk.user.id}`} className="font-semibold text-primary-700 hover:underline">
                {tk.user.name}
              </Link>
              <p className="text-fg-muted" dir="ltr">
                {tk.user.email}
              </p>
            </div>
          )}
          <FormField label={t('admin.common.status')}>
            <Select
              value={tk.status}
              onValueChange={(status) => patch.mutate({ path: `tickets/${id}`, body: { status } }, { onSuccess: () => toast.success(t('admin.common.saved')), onError: fail })}
              options={(['open', 'pending', 'resolved', 'closed'] as const).map((s) => ({ value: s, label: t(`admin.status.${s}`) }))}
            />
          </FormField>
          <FormField label={t('admin.support.priority')}>
            <Select
              value={tk.priority}
              onValueChange={(priority) => patch.mutate({ path: `tickets/${id}`, body: { priority } }, { onSuccess: () => toast.success(t('admin.common.saved')), onError: fail })}
              options={(['low', 'normal', 'high', 'urgent'] as const).map((p) => ({ value: p, label: t(`admin.support.priorities.${p}`) }))}
            />
          </FormField>
          <dl className="grid gap-2">
            <div className="flex justify-between">
              <dt className="text-fg-muted">{t('support.category')}</dt>
              <dd>{t(`support.categories.${tk.category}`, { defaultValue: tk.category })}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-fg-muted">{t('admin.disputes.opened')}</dt>
              <dd>{formatDateTime(tk.createdAt, lang)}</dd>
            </div>
            {tk.orderId && (
              <div className="flex justify-between">
                <dt className="text-fg-muted">{t('admin.orders.number')}</dt>
                <dd>
                  <Link to={`/admin/orders/${tk.orderId}`} className="text-primary-700 hover:underline">
                    {t('admin.support.viewOrder')}
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        </Card>
      </div>
    </>
  );
}
