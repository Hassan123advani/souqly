import { useTranslation } from 'react-i18next';
import { HandCoins } from 'lucide-react';
import { useFlag, usePublicConfig } from '@/api/config';
import { useAffiliateCommissions, type AffiliateCommission } from '@/api/growth';
import { Seo } from '@/components/layout/Seo';
import { Badge, Button, Card, EmptyState, ErrorState, SectionHeader, Skeleton, type BadgeTone } from '@/components/ui';
import { useLang } from '@/lib/catalog';
import { formatDate, money } from '@/lib/format';
import { AFFILIATE_PCT } from '@/lib/rates';

const TONE: Record<AffiliateCommission['status'], BadgeTone> = { pending: 'warning', credited: 'success', void: 'neutral' };

/** Buyer affiliate earnings: commissions from orders placed through their shared product links. */
export default function AffiliatePage() {
  const { t } = useTranslation();
  const lang = useLang();
  const cfg = usePublicConfig();
  const on = useFlag('affiliateLinks');
  const q = useAffiliateCommissions(on);
  const rows = q.data ?? [];
  const sum = (s: AffiliateCommission['status']) => rows.filter((r) => r.status === s).reduce((a, r) => a + r.amount, 0);

  return (
    <>
      <Seo title={t('growth.affiliate.title')} noindex />
      <SectionHeader as="h1" title={t('growth.affiliate.title')} description={t('growth.affiliate.howItWorks', { pct: AFFILIATE_PCT })} />
      {cfg.isLoading ? (
        <Skeleton className="h-48" />
      ) : !on ? (
        <Card>
          <EmptyState icon={<HandCoins />} title={t('growth.affiliate.off')} />
        </Card>
      ) : q.error ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : q.isLoading ? (
        <div className="grid gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-48" />
        </div>
      ) : (
        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <p className="text-xs font-semibold text-fg-muted">{t('growth.affiliate.credited')}</p>
              <p className="mt-1 text-xl font-extrabold text-success" dir="ltr">
                {money(sum('credited'))}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-semibold text-fg-muted">{t('growth.affiliate.pending')}</p>
              <p className="mt-1 text-xl font-extrabold text-fg" dir="ltr">
                {money(sum('pending'))}
              </p>
            </Card>
          </div>
          {!rows.length ? (
            <Card>
              <EmptyState
                icon={<HandCoins />}
                title={t('growth.affiliate.empty')}
                description={t('growth.affiliate.emptyBody')}
                action={
                  <Button to="/" size="sm">
                    {t('growth.affiliate.browse')}
                  </Button>
                }
              />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-border">
                {rows.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-fg" dir="ltr">
                        {r.orderNumber}
                      </p>
                      <p className="text-xs text-fg-muted">{formatDate(r.createdAt, lang)}</p>
                    </div>
                    <span className="font-bold" dir="ltr">
                      {money(r.amount)}
                    </span>
                    <Badge tone={TONE[r.status]} size="sm">
                      {t(`growth.affiliate.status.${r.status}`)}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
