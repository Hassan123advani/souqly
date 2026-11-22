import { useTranslation } from 'react-i18next';
import { ProfileCard } from '@/components/account/ProfileCard';
import { Seo } from '@/components/layout/Seo';
import { SectionHeader } from '@/components/ui';

export default function AdminProfilePage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-3xl">
      <Seo title={t('admin.nav.profile')} noindex />
      <SectionHeader as="h1" title={t('admin.nav.profile')} />
      <ProfileCard />
    </div>
  );
}
