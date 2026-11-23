import { useTranslation } from 'react-i18next';
import { Wallet } from 'lucide-react';
import { useFlag } from '@/api/config';
import { flatPages } from '@/api/social';
import { useWallet, useWalletTransactions } from '@/api/wallet';
import { Seo } from '@/components/layout/Seo';
import { GiftCardRedeem } from '@/components/wallet/GiftCardRedeem';
import { TxList } from '@/components/wallet/TxList';
import { Button, Card, SectionHeader, Skeleton } from '@/components/ui';
import { money } from '@/lib/format';

/** `/account/wallet`: balance, gift card redeem and the transaction ledger. */
export default function WalletPage() {
  const { t } = useTranslation();
  const wallet = useWallet();
  const tx = useWalletTransactions();
  const giftOn = useFlag('giftCards');
  const rows = flatPages(tx.data).map((r) => ({ ...r, amount: r.type === 'debit' ? -Math.abs(r.amount) : Math.abs(r.amount) }));
  return (
    <div className="space-y-5">
      <Seo title={t('wallet.title')} noindex />
      <SectionHeader as="h2" title={t('wallet.title')} />
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-700 to-primary-900 p-5 text-white shadow-card sm:p-6 rtl:bg-gradient-to-bl">
        <Wallet className="absolute -bottom-4 end-2 size-28 opacity-10" aria-hidden />
        <p className="text-sm font-semibold text-white/80">{t('wallet.balance')}</p>
        {wallet.isPending ? (
          <Skeleton className="mt-2 h-10 w-40 bg-white/20" />
        ) : wallet.isError ? (
          <div className="mt-2 flex items-center gap-3">
            <p className="text-sm">{t('wallet.loadError')}</p>
            <Button size="sm" variant="accent" onClick={() => void wallet.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : (
          <p className="latin mt-1 text-4xl font-extrabold tracking-tight tabular">{money(wallet.data.balance)}</p>
        )}
        <p className="mt-2 max-w-md text-xs text-white/75">{t('wallet.hint')}</p>
      </div>
      {giftOn && <GiftCardRedeem />}
      <Card>
        <h2 className="border-b border-border px-4 py-3 font-bold text-fg sm:px-5">{t('wallet.history')}</h2>
        <TxList
          rows={rows}
          format={money}
          pending={tx.isPending}
          error={tx.error}
          onRetry={() => void tx.refetch()}
          hasMore={!!tx.hasNextPage}
          loadingMore={tx.isFetchingNextPage}
          onMore={() => void tx.fetchNextPage()}
        />
      </Card>
    </div>
  );
}
