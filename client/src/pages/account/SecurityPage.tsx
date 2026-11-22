import { useTranslation } from 'react-i18next';
import { SecurityPanel } from '@/components/account/SecurityCards';
import { Seo } from '@/components/layout/Seo';

export default function SecurityPage() {
  const { t } = useTranslation();
  return (
    <>
      <Seo title={t('account.nav.security')} noindex />
      <SecurityPanel />
    </>
  );
}
