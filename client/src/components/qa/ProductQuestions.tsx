import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MessageCircleQuestion, Store } from 'lucide-react';
import { useMe } from '@/api/auth';
import { flatPages, useAskQuestion, useProductQuestions } from '@/api/social';
import { socialError } from '@/components/social/errors';
import { useAuthGate } from '@/components/social/useAuthGate';
import { Badge, Button, EmptyState, ErrorState, LoadMore, SectionHeader, Skeleton, Textarea } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { formatDate } from '@/lib/format';

/** PDP questions & answers: list (published only) + ask form for signed-in buyers. */
export function ProductQuestions({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const lang = useLang();
  const { data: me } = useMe();
  const gate = useAuthGate();
  const q = useProductQuestions(slug);
  const ask = useAskQuestion(slug);
  const [text, setText] = useState('');
  const items = flatPages(q.data);
  const valid = text.trim().length >= 5;

  const submit = () =>
    ask.mutate(text.trim(), {
      onSuccess: () => {
        setText('');
        toast.success(t('qa.submitted'));
      },
      onError: (e) => toast.error(socialError(e)),
    });

  return (
    <section className="mt-10 scroll-mt-24" id="questions" aria-labelledby="qa-title">
      <SectionHeader title={<span id="qa-title">{t('qa.title')}</span>} />
      <div className="mt-4 rounded-lg border border-border bg-surface p-4 sm:p-6">
        {me ? (
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-start"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) submit();
            }}
          >
            <label htmlFor="qa-ask" className="sr-only">
              {t('qa.ask')}
            </label>
            <Textarea id="qa-ask" rows={2} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('qa.placeholder')} className="flex-1" />
            <Button type="submit" disabled={!valid} loading={ask.isPending} className="shrink-0">
              {t('qa.ask')}
            </Button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-2/60 p-3">
            <p className="text-sm text-fg-muted">{t('qa.loginToAsk')}</p>
            <Button size="sm" variant="outline" onClick={() => gate(() => undefined)}>
              {t('qa.ask')}
            </Button>
          </div>
        )}

        <div className="mt-4 divide-y divide-border">
          {q.isPending ? (
            [0, 1].map((i) => (
              <div key={i} className="space-y-2 py-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))
          ) : q.isError ? (
            <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
          ) : items.length === 0 ? (
            <EmptyState compact icon={<MessageCircleQuestion className="size-6" />} title={t('qa.none')} description={t('qa.noneHint')} />
          ) : (
            items.map((x) => (
              <article key={x.id} className="space-y-2 py-4">
                <p className="flex gap-2 text-sm font-semibold text-fg">
                  <span className="grid size-6 shrink-0 place-items-center rounded-sm bg-accent-50 text-xs font-extrabold text-accent-800" aria-hidden>
                    {t('qa.q')}
                  </span>
                  <span>{x.text}</span>
                </p>
                <p className="ps-8 text-xs text-fg-subtle">
                  {x.askerName} · {formatDate(x.createdAt, lang, { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                {x.answer ? (
                  <div className="flex gap-2 text-sm text-fg">
                    <span className="grid size-6 shrink-0 place-items-center rounded-sm bg-primary-50 text-xs font-extrabold text-primary-800" aria-hidden>
                      {t('qa.a')}
                    </span>
                    <div className="min-w-0">
                      <p className="whitespace-pre-line">{x.answer.text}</p>
                      <Badge tone="primary" size="sm" className="mt-1.5">
                        <Store className="size-3" aria-hidden />
                        {t('qa.answeredBySeller')}
                      </Badge>
                    </div>
                  </div>
                ) : (
                  <p className="ps-8 text-xs italic text-fg-muted">{t('qa.awaiting')}</p>
                )}
              </article>
            ))
          )}
        </div>
        <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onLoadMore={() => void q.fetchNextPage()} />
      </div>
    </section>
  );
}
