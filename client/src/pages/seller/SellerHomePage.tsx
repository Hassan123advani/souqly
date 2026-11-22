import { useTranslation } from 'react-i18next';
import { LayoutDashboard } from 'lucide-react';
import { useMe } from '@/api/auth';
import { Seo } from '@/components/layout/Seo';
import { Badge, Card, EmptyState, SectionHeader } from '@/components/ui';

export default function SellerHomePage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const store = me?.stores[0];
  return (
    <>
      <Seo title={t('nav.sellerCenter')} noindex />
      <SectionHeader
        as="h1"
        eyebrow={t('nav.sellerCenter')}
        title={t('seller.home.greeting', { name: me?.name.split(' ')[0] ?? '' })}
        description={store ? t('seller.home.storeLine', { store: store.name }) : undefined}
        action={store ? <Badge tone={store.status === 'approved' ? 'success' : 'warning'}>{t(`storeStatus.${store.status}`, store.status)}</Badge> : undefined}
      />
      <Card>
        <EmptyState icon={<LayoutDashboard />} title={t('coming.releaseTitle')} description={t('seller.home.coming')} />
      </Card>
    </>
  );
}
