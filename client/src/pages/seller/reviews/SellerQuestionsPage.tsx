import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MessageCircleQuestion } from 'lucide-react';
import type { QuestionDTO } from '@souqly/shared';
import { flatPages, useAnswerQuestion, useSellerQuestions } from '@/api/social';
import { Seo } from '@/components/layout/Seo';
import { socialError } from '@/components/social/errors';
import { Badge, Button, Card, EmptyState, ErrorState, LoadMore, SectionHeader, Skeleton, Tabs, TabsList, TabsTrigger, Textarea } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { formatDate } from '@/lib/format';

function QuestionRow({ q }: { q: QuestionDTO }) {
  const { t } = useTranslation();
  const lang = useLang();
  const answer = useAnswerQuestion();
  const [text, setText] = useState('');
  return (
    <li className="space-y-2 py-4">
      {q.product && (
        <Link to={`/p/${q.product.slug}`} className="text-xs font-semibold text-primary-700 hover:underline">
          {q.product.title}
        </Link>
      )}
      <p className="text-sm font-semibold text-fg">{q.text}</p>
      <p className="text-xs text-fg-subtle">
        {q.askerName} · {formatDate(q.createdAt, lang, { day: 'numeric', month: 'short', year: 'numeric' })}
      </p>
      {q.answer ? (
        <div className="rounded-md bg-primary-50/60 p-3 text-sm text-fg">
          <Badge tone="primary" size="sm" className="mb-1">
            {t('qa.seller.answered')}
          </Badge>
          <p className="whitespace-pre-line">{q.answer.text}</p>
        </div>
      ) : (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-start"
          onSubmit={(e) => {
            e.preventDefault();
            answer.mutate(
              { id: q.id, text: text.trim() },
              { onSuccess: () => toast.success(t('qa.seller.sent')), onError: (err) => toast.error(socialError(err)) },
            );
          }}
        >
          <Textarea rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('qa.seller.answerPh')} aria-label={t('qa.seller.answer')} className="flex-1" />
          <Button type="submit" size="sm" disabled={!text.trim()} loading={answer.isPending}>
            {t('qa.seller.answer')}
          </Button>
        </form>
      )}
    </li>
  );
}

/** `/seller/questions`: unanswered first, answer inline. */
export default function SellerQuestionsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'open' | 'all'>('open');
  const q = useSellerQuestions(tab === 'open');
  const items = flatPages(q.data);
  return (
    <>
      <Seo title={t('qa.seller.title')} noindex />
      <SectionHeader as="h1" title={t('qa.seller.title')} description={t('qa.seller.subtitle')} action={<Button to="/seller/reviews" variant="outline" size="sm">{t('reviews.seller.title')}</Button>} />
      <Card className="mt-5">
        <div className="border-b border-border p-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'open' | 'all')}>
            <TabsList>
              <TabsTrigger value="open">{t('qa.seller.unanswered')}</TabsTrigger>
              <TabsTrigger value="all">{t('qa.seller.all')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <ul className="divide-y divide-border px-4 sm:px-5">
          {q.isPending ? (
            [0, 1, 2].map((i) => (
              <li key={i} className="space-y-2 py-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-10 w-full" />
              </li>
            ))
          ) : q.isError ? (
            <li>
              <ErrorState error={q.error} onRetry={() => void q.refetch()} className="my-6" />
            </li>
          ) : !items.length ? (
            <li>
              <EmptyState className="my-6" icon={<MessageCircleQuestion className="size-6" />} title={tab === 'open' ? t('qa.seller.allCaughtUp') : t('qa.seller.none')} />
            </li>
          ) : (
            items.map((x) => <QuestionRow key={x.id} q={x} />)
          )}
        </ul>
        <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onLoadMore={() => void q.fetchNextPage()} className="pb-4" />
      </Card>
    </>
  );
}
