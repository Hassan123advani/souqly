import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Star } from 'lucide-react';
import { usePendingReviews } from '@/api/social';
import { Button } from '@/components/ui';

/** Gentle reminder shown in the account area while delivered items wait for a review. */
export function PendingReviewsBanner() {
  const { t } = useTranslation();
  const { data } = usePendingReviews();
  const { pathname } = useLocation();
  if (pathname.startsWith('/account/reviews')) return null;
  if (!data?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-accent-100 bg-accent-50 p-3 sm:p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-fg">
        <Star className="size-5 fill-current" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-fg">{t('reviews.reminder.title', { n: data.length })}</p>
        <p className="text-xs text-fg-muted">{t('reviews.reminder.body')}</p>
      </div>
      <Button to="/account/reviews" size="sm" variant="accent">
        {t('reviews.reminder.cta')}
      </Button>
    </div>
  );
}
