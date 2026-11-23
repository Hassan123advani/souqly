import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MessageSquareReply, Star } from 'lucide-react';
import type { ReviewDTO } from '@souqly/shared';
import { flatPages, useReplyReview, useSellerReviews } from '@/api/social';
import { Seo } from '@/components/layout/Seo';
import { ReviewCard } from '@/components/reviews/ReviewCard';
import { socialError } from '@/components/social/errors';
import { Button, Card, EmptyState, ErrorState, LoadMore, SectionHeader, Select, Skeleton, Textarea } from '@/components/ui';

function ReplyBox({ r }: { r: ReviewDTO }) {
  const { t } = useTranslation();
  const reply = useReplyReview();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(r.reply?.text ?? '');
  if (!open)
    return (
      <Button size="sm" variant="outline" leftIcon={<MessageSquareReply className="size-4" />} onClick={() => setOpen(true)}>
        {r.reply ? t('reviews.seller.editReply') : t('reviews.seller.reply')}
      </Button>
    );
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        reply.mutate(
          { id: r.id, text: text.trim() },
          {
            onSuccess: () => {
              toast.success(t('reviews.seller.replied'));
              setOpen(false);
            },
            onError: (err) => toast.error(socialError(err)),
          },
        );
      }}
    >
      <Textarea rows={3} maxLength={1000} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={t('reviews.seller.replyPh')} aria-label={t('reviews.seller.reply')} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!text.trim()} loading={reply.isPending}>
          {t('reviews.seller.send')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

/** `/seller/reviews`: store reviews with rating / replied filters and public replies. */
export default function SellerReviewsPage() {
  const { t } = useTranslation();
  const [rating, setRating] = useState('all');
  const [replied, setReplied] = useState('all');
  const q = useSellerReviews({
    ...(rating !== 'all' ? { rating: Number(rating) } : {}),
    ...(replied !== 'all' ? { replied: replied as '0' | '1' } : {}),
  });
  const items = flatPages(q.data);
  return (
    <>
      <Seo title={t('reviews.seller.title')} noindex />
      <SectionHeader as="h1" title={t('reviews.seller.title')} description={t('reviews.seller.subtitle')} action={<Button to="/seller/questions" variant="outline" size="sm">{t('qa.seller.title')}</Button>} />
      <Card className="mt-5">
        <div className="flex flex-wrap gap-3 border-b border-border p-4">
          <div className="w-40">
            <Select
              value={rating}
              onValueChange={setRating}
              options={[{ value: 'all', label: t('reviews.seller.allRatings') }, ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: t('reviews.starsN', { n }) }))]}
            />
          </div>
          <div className="w-44">
            <Select
              value={replied}
              onValueChange={setReplied}
              options={[
                { value: 'all', label: t('reviews.seller.all') },
                { value: '0', label: t('reviews.seller.unreplied') },
                { value: '1', label: t('reviews.seller.repliedF') },
              ]}
            />
          </div>
        </div>
        <div className="divide-y divide-border px-4 sm:px-5">
          {q.isPending ? (
            [0, 1, 2].map((i) => (
              <div key={i} className="space-y-2 py-5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))
          ) : q.isError ? (
            <ErrorState error={q.error} onRetry={() => void q.refetch()} className="my-6" />
          ) : !items.length ? (
            <EmptyState className="my-6" icon={<Star className="size-6" />} title={t('reviews.seller.none')} />
          ) : (
            items.map((r) => (
              <div key={r.id} className="pb-4">
                <ReviewCard r={r} showProduct />
                <ReplyBox r={r} />
              </div>
            ))
          )}
        </div>
        <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onLoadMore={() => void q.fetchNextPage()} className="pb-4" />
      </Card>
    </>
  );
}
