import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Copy, Share2, Users } from 'lucide-react';
import { LOYALTY } from '@souqly/shared';
import { useReferrals } from '@/api/wallet';
import { Seo } from '@/components/layout/Seo';
import { Button, Card, ErrorState, SectionHeader, Skeleton } from '@/components/ui';
import { money } from '@/lib/format';

/** `/account/referrals`: my code, share link (copy / WhatsApp / native share) and stats. */
export default function ReferralsPage() {
  const { t } = useTranslation();
  const q = useReferrals();

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('common.copied'));
    } catch {
      toast.error(t('wallet.referrals.copyFailed'));
    }
  };

  return (
    <div className="space-y-5">
      <Seo title={t('wallet.referrals.title')} noindex />
      <SectionHeader as="h2" title={t('wallet.referrals.title')} description={t('wallet.referrals.subtitle', { wallet: money(LOYALTY.REFERRER_WALLET_MINOR), coins: LOYALTY.REFEREE_COINS })} />
      {q.isPending ? (
        <Skeleton className="h-56 w-full rounded-lg" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <Card className="p-5 text-center sm:p-6">
            <p className="text-sm font-semibold text-fg-muted">{t('wallet.referrals.yourCode')}</p>
            <p className="latin mx-auto mt-2 inline-block rounded-md border-2 border-dashed border-primary-200 bg-primary-50 px-5 py-2 text-2xl font-extrabold tracking-[0.2em] text-primary-800">
              {q.data.code}
            </p>
            <p className="latin mx-auto mt-3 max-w-md truncate text-xs text-fg-subtle" dir="ltr">
              {q.data.shareUrl}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button variant="outline" leftIcon={<Copy className="size-4" />} onClick={() => void copy(q.data.shareUrl)}>
                {t('wallet.referrals.copyLink')}
              </Button>
              <Button
                href={`https://wa.me/?text=${encodeURIComponent(t('wallet.referrals.shareText', { url: q.data.shareUrl }))}`}
                target="_blank"
                rel="noreferrer"
                className="bg-[#1F8A5B] text-white"
                leftIcon={<Share2 className="size-4" />}
              >
                {t('wallet.referrals.whatsapp')}
              </Button>
              {typeof navigator.share === 'function' && (
                <Button
                  variant="ghost"
                  onClick={() => void navigator.share({ title: 'Souqly', text: t('wallet.referrals.shareText', { url: '' }), url: q.data.shareUrl }).catch(() => undefined)}
                >
                  {t('wallet.referrals.more')}
                </Button>
              )}
            </div>
          </Card>
          <dl className="grid grid-cols-3 gap-3">
            {[
              { label: t('wallet.referrals.invited'), value: String(q.data.invited) },
              { label: t('wallet.referrals.rewarded'), value: String(q.data.rewarded) },
              { label: t('wallet.referrals.earned'), value: money(q.data.earned) },
            ].map((s) => (
              <Card key={s.label} className="p-4 text-center">
                <dt className="text-xs text-fg-muted">{s.label}</dt>
                <dd className="latin mt-1 text-lg font-extrabold text-fg tabular sm:text-xl">{s.value}</dd>
              </Card>
            ))}
          </dl>
          <Card className="flex gap-3 p-4 text-sm text-fg-muted">
            <Users className="size-5 shrink-0 text-primary-700" aria-hidden />
            <p>{t('wallet.referrals.how')}</p>
          </Card>
        </>
      )}
    </div>
  );
}
