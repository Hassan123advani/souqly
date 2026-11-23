import { useTranslation } from 'react-i18next';
import { CreditCard, Flag, Globe, Receipt, Truck } from 'lucide-react';
import { PageHeader } from '@/components/admin/PageHeader';
import { FlagsSettings } from '@/components/admin/settings/FlagsSettings';
import { PaymentSettings, ShippingSettings, TaxSettingsForm } from '@/components/admin/settings/CommerceSettings';
import { SiteSettingsForm } from '@/components/admin/settings/SiteSettingsForm';
import { useUrlFilters } from '@/components/admin/useUrlFilters';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';

export default function SettingsPage() {
  const { t } = useTranslation();
  const [f, setF] = useUrlFilters(['tab'] as const);
  const tab = f.tab || 'site';
  return (
    <>
      <PageHeader title={t('admin.nav.settings')} description={t('admin.settings.subtitle')} crumbs={[{ label: t('admin.nav.platform') }]} />
      <Tabs value={tab} onValueChange={(v) => setF({ tab: v === 'site' ? '' : v })}>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList>
            <TabsTrigger value="site" icon={<Globe className="size-4" />}>{t('admin.settings.tabs.site')}</TabsTrigger>
            <TabsTrigger value="flags" icon={<Flag className="size-4" />}>{t('admin.settings.tabs.flags')}</TabsTrigger>
            <TabsTrigger value="payments" icon={<CreditCard className="size-4" />}>{t('admin.settings.tabs.payments')}</TabsTrigger>
            <TabsTrigger value="shipping" icon={<Truck className="size-4" />}>{t('admin.settings.tabs.shipping')}</TabsTrigger>
            <TabsTrigger value="tax" icon={<Receipt className="size-4" />}>{t('admin.settings.tabs.tax')}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="site" className="pt-4">
          <SiteSettingsForm />
        </TabsContent>
        <TabsContent value="flags" className="pt-4">
          <FlagsSettings />
        </TabsContent>
        <TabsContent value="payments" className="pt-4">
          <PaymentSettings />
        </TabsContent>
        <TabsContent value="shipping" className="pt-4">
          <ShippingSettings />
        </TabsContent>
        <TabsContent value="tax" className="pt-4">
          <TaxSettingsForm />
        </TabsContent>
      </Tabs>
    </>
  );
}
