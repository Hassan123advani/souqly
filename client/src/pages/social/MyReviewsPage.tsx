import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PackageCheck, Star } from 'lucide-react';
import type { PendingReviewDTO } from '@souqly/shared';
import { flatPages, useMyReviews, usePendingReviews } from '@/api/social';
import { Seo } from '@/components/layout/Seo';
import { ProductImage } from '@/components/product/ProductImage';
import { ReviewCard } from '@/components/reviews/ReviewCard';
import { WriteReviewModal } from '@/components/reviews/WriteReviewModal';
import { Button, Card, EmptyState, ErrorState, LoadMore, SectionHeader, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { formatDate } from '@/lib/format';

function RowsSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}

function ToReview() {
  const { t } = useTranslation();
  const lang = useLang();
  const q = usePendingReviews();
  const [writing, setWriting] = useState<PendingReviewDTO | null>(null);
  if (q.isPending) return <RowsSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data.length) return <EmptyState icon={<PackageCheck className="size-6" />} title={t('reviews.mine.noPending')} description={t('reviews.mine.noPendingHint')} />;
  return (
    <>
      <ul className="space-y-3">
        {q.data.map((it) => (
          <li key={`${it.orderId}-${it.variantId}`}>
            <Card className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
              <ProductImage src={it.image ?? ''} alt="" className="size-16 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-semibold text-fg">{it.title}</p>
                <p className="mt-0.5 text-xs text-fg-muted">
                  {t('reviews.mine.order', { n: it.orderNumber })}
                  {it.deliveredAt && <> · {t('reviews.mine.delivered', { date: formatDate(it.deliveredAt, lang, { day: 'numeric', month: 'short' }) })}</>}
                </p>
              </div>
              <Button size="sm" leftIcon={<Star className="size-4" />} onClick={() => setWriting(it)}>
                {t('reviews.mine.write')}
              </Button>
            </Card>
          </li>
        ))}
      </ul>
      {writing && <WriteReviewModal item={writing} onClose={() => setWriting(null)} />}
    </>
  );
}

function Mine() {
  const { t } = useTranslation();
  const q = useMyReviews();
  const items = flatPages(q.data);
  if (q.isPending) return <RowsSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!items.length) return <EmptyState icon={<Star className="size-6" />} title={t('reviews.mine.none')} />;
  return (
    <Card className="px-4 sm:px-5">
      <div className="divide-y divide-border">
        {items.map((r) => (
          <ReviewCard key={r.id} r={r} showProduct />
        ))}
      </div>
      <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onLoadMore={() => void q.fetchNextPage()} className="pb-4" />
    </Card>
  );
}

/** `/account/reviews`: "To review" (delivered, not yet reviewed) + "My reviews". */
export default function MyReviewsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'mine' ? 'mine' : 'pending';
  const pending = usePendingReviews();
  return (
    <div className="space-y-5">
      <Seo title={t('reviews.mine.title')} noindex />
      <SectionHeader as="h2" title={t('reviews.mine.title')} />
      <Tabs value={tab} onValueChange={(v) => setParams(v === 'mine' ? { tab: 'mine' } : {}, { replace: true })}>
        <TabsList>
          <TabsTrigger value="pending">
            {t('reviews.mine.toReview')}
            {!!pending.data?.length && <span className="latin ms-1 tabular">({pending.data.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="mine">{t('reviews.mine.mine')}</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="mt-4">
          <ToReview />
        </TabsContent>
        <TabsContent value="mine" className="mt-4">
          <Mine />
        </TabsContent>
      </Tabs>
    </div>
  );
}
