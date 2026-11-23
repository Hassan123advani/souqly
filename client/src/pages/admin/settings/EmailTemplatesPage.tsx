import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Eye, Mail, RotateCcw, Save, Send } from 'lucide-react';
import { useMe } from '@/api/auth';
import { useAdminGet, useAdminMutation, type EmailTemplateRow } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { PageHeader } from '@/components/admin/PageHeader';
import { Badge, Button, Card, EmptyState, ErrorState, FormField, Input, Skeleton, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';

export default function EmailTemplatesPage() {
  const { t } = useTranslation();
  const q = useAdminGet<EmailTemplateRow[]>('email-templates');
  const [key, setKey] = useState<string | null>(null);
  const rows = q.data ?? [];
  const current = rows.find((r) => r.key === key) ?? rows[0];

  return (
    <>
      <PageHeader title={t('admin.nav.emailTemplates')} description={t('admin.emails.subtitle')} crumbs={[{ label: t('admin.nav.platform') }]} />
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.isLoading ? (
        <Skeleton className="h-[520px]" />
      ) : !current ? (
        <EmptyState icon={<Mail />} title={t('admin.common.empty')} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Card className="h-fit overflow-hidden">
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.key}>
                  <button
                    type="button"
                    onClick={() => setKey(r.key)}
                    className={cn('flex w-full flex-col items-start gap-0.5 px-4 py-3 text-start hover:bg-surface-2', r.key === current.key && 'bg-primary-50')}
                    aria-current={r.key === current.key}
                  >
                    <span className="flex w-full items-center gap-2 text-sm font-semibold text-fg">
                      {r.description}
                      {r.override && (
                        <Badge size="sm" tone="info" className="ms-auto">
                          {t('admin.emails.custom')}
                        </Badge>
                      )}
                    </span>
                    <code className="latin text-[11px] text-fg-muted">{r.key}</code>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <Editor key={current.key} tpl={current} />
        </div>
      )}
    </>
  );
}

function Editor({ tpl }: { tpl: EmailTemplateRow }) {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const put = useAdminMutation('put', ['email-templates']);
  const del = useAdminMutation('delete', ['email-templates']);
  const preview = useAdminMutation<unknown, { subject: string; html: string }>('post');
  const test = useAdminMutation('post');
  const [subject, setSubject] = useState(tpl.override?.subject ?? tpl.defaultSubject);
  const [html, setHtml] = useState(tpl.override?.html ?? '');
  const [to, setTo] = useState(me?.email ?? '');
  const [reset, setReset] = useState(false);
  const fail = (e: unknown) => toast.error(getErrorMessage(e));
  const run = () => preview.mutate({ path: `email-templates/${tpl.key}/preview`, body: html.trim() ? { subject, html } : {} }, { onError: fail });
  useEffect(run, []); // initial render of the saved / default template

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="grid content-start gap-4 p-5">
        <FormField label={t('admin.emails.subject')}>
          <Input value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
        </FormField>
        <FormField label={t('admin.emails.html')} hint={html.trim() ? undefined : t('admin.emails.usingDefault')}>
          <Textarea rows={16} dir="ltr" className="latin font-mono text-xs" value={html} onChange={(e) => setHtml(e.target.value)} placeholder="<p>Hi {{name}}, …</p>" />
        </FormField>
        {tpl.variables.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
            {t('admin.emails.variables')}
            {tpl.variables.map((v) => (
              <code key={v} className="latin rounded bg-surface-2 px-1.5 py-0.5">{`{{${v}}}`}</code>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" leftIcon={<Eye className="size-4" />} loading={preview.isPending} onClick={run}>
            {t('admin.emails.preview')}
          </Button>
          {tpl.override && (
            <Button variant="ghost" size="sm" leftIcon={<RotateCcw className="size-4" />} onClick={() => setReset(true)}>
              {t('admin.emails.reset')}
            </Button>
          )}
          <Button
            size="sm"
            className="ms-auto"
            leftIcon={<Save className="size-4" />}
            loading={put.isPending}
            disabled={!html.trim() || !subject.trim()}
            onClick={() => put.mutate({ path: `email-templates/${tpl.key}`, body: { subject, html } }, { onSuccess: () => toast.success(t('admin.common.saved')), onError: fail })}
          >
            {t('admin.common.save')}
          </Button>
        </div>
        <div className="flex gap-2 border-t border-border pt-4">
          <Input dir="ltr" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com" aria-label={t('admin.emails.testTo')} />
          <Button variant="outline" leftIcon={<Send className="size-4" />} loading={test.isPending} onClick={() => test.mutate({ path: `email-templates/${tpl.key}/test`, body: { to } }, { onSuccess: () => toast.success(t('admin.emails.testSent', { to })), onError: fail })}>
            {t('admin.emails.sendTest')}
          </Button>
        </div>
      </Card>
      <Card className="flex min-h-[520px] flex-col overflow-hidden">
        <div className="border-b border-border bg-surface-2 px-4 py-2.5 text-sm">
          <span className="text-fg-muted">{t('admin.emails.subject')}: </span>
          <span className="font-semibold">{preview.data?.subject ?? '…'}</span>
        </div>
        {/* Sandboxed: no scripts, no same-origin access. */}
        {preview.data ? <iframe title={t('admin.emails.preview')} sandbox="" srcDoc={preview.data.html} className="w-full flex-1 bg-white" /> : <Skeleton className="m-4 flex-1" />}
      </Card>
      <ConfirmDialog
        open={reset}
        onOpenChange={setReset}
        title={t('admin.emails.resetTitle')}
        confirmLabel={t('admin.emails.reset')}
        tone="danger"
        loading={del.isPending}
        onConfirm={() => del.mutate({ path: `email-templates/${tpl.key}` }, { onSuccess: () => (toast.success(t('admin.emails.resetDone')), setReset(false), setHtml('')), onError: fail })}
      />
    </div>
  );
}
