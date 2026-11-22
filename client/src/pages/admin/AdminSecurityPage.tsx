import { useTranslation } from 'react-i18next';
import { SecurityPanel } from '@/components/account/SecurityCards';
import { Seo } from '@/components/layout/Seo';
import { SectionHeader } from '@/components/ui';

export default function AdminSecurityPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-3xl">
      <Seo title={t('admin.nav.security')} noindex />
      <SectionHeader as="h1" title={t('admin.nav.security')} description={t('admin.securityIntro')} />
      <SecurityPanel />
    </div>
  );
}
