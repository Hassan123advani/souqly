import { useTranslation } from 'react-i18next';
import { Coins, MessageSquareText, Store, UserPlus, Wallet } from 'lucide-react';
import { useFlag } from '@/api/config';

/** Phase 8 account sidebar entries (reviews, following, wallet, coins, referrals), flag-aware. */
export function useSocialAccountNav() {
  const { t } = useTranslation();
  const coinsOn = useFlag('loyaltyCoins');
  const referralsOn = useFlag('referrals');
  return [
    { to: 'reviews', label: t('reviews.mine.title'), icon: MessageSquareText },
    { to: 'following', label: t('social.following.title'), icon: Store },
    { to: 'wallet', label: t('wallet.title'), icon: Wallet },
    ...(coinsOn ? [{ to: 'coins', label: t('wallet.coins.title'), icon: Coins }] : []),
    ...(referralsOn ? [{ to: 'referrals', label: t('wallet.referrals.title'), icon: UserPlus }] : []),
  ];
}
