import { useTranslation } from 'react-i18next';
import { Coins, Copy, Gift, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useMe } from '@/api/auth';
import { useFlag } from '@/api/config';
import { ProfileCard } from '@/components/account/ProfileCard';
import { Seo } from '@/components/layout/Seo';
import { Card, IconButton, Price } from '@/components/ui';
import { formatNumber } from '@/lib/format';
import { useUi } from '@/stores/ui';
import { StoreInvitations } from '@/components/seller/StoreInvitations';

export default function ProfilePage() {
  const { t } = useTranslation();
  const lang = useUi((s) => s.language);
  const { data: me } = useMe();
  const referrals = useFlag('referrals');
  if (!me) return null;

  const copyReferral = async () => {
    const link = `${window.location.origin}/signup?ref=${encodeURIComponent(me.referralCode)}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t('account.profile.referralCopied'));
    } catch {
      toast.error(t('errors.GENERIC'));
    }
  };

  return (
    <>
      <Seo title={t('account.nav.profile')} noindex />
      <StoreInvitations />
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-3 p-4">
          <span className="grid size-10 place-items-center rounded-full bg-primary-50 text-primary-700">
            <Wallet className="size-5" />
          </span>
          <div>
            <p className="text-xs font-medium text-fg-muted">{t('account.stats.wallet')}</p>
            <Price amount={me.walletBalance ?? 0} size="md" />
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <span className="grid size-10 place-items-center rounded-full bg-accent-50 text-accent-700">
            <Coins className="size-5" />
          </span>
          <div>
            <p className="text-xs font-medium text-fg-muted">{t('account.stats.coins')}</p>
            <p className="text-base font-extrabold text-fg tabular">{formatNumber(me.coins ?? 0, lang)}</p>
          </div>
        </Card>
        {referrals && me.referralCode && (
          <Card className="flex items-center gap-3 p-4">
            <span className="grid size-10 place-items-center rounded-full bg-sale-50 text-sale-600">
              <Gift className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-fg-muted">{t('account.stats.referral')}</p>
              <p className="latin truncate text-base font-extrabold tracking-wider text-fg">{me.referralCode}</p>
            </div>
            <IconButton label={t('account.profile.copyReferral')} size="sm" onClick={copyReferral}>
              <Copy className="size-4" />
            </IconButton>
          </Card>
        )}
      </div>
      <ProfileCard />
    </>
  );
}
