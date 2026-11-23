import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { PERMISSIONS, STORE_ROLES } from '@souqly/shared';
import { useSellerStore } from '@/api/seller';
import { Seo } from '@/components/layout/Seo';
import { Button, Card, ErrorState, PageSpinner, SectionHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { BusinessCard, PayoutCard } from '@/components/seller/forms/AccountForms';
import { BrandingTab } from '@/components/seller/store/BrandingTab';
import { LayoutTab } from '@/components/seller/store/LayoutTab';
import { AdvancedTab, HolidayTab, PoliciesTab, SeoTab } from '@/components/seller/store/MiscTabs';

const TABS = ['branding', 'layout', 'policies', 'seo', 'holiday', 'account', 'advanced'] as const;

export default function StoreSettingsPage() {
  const { t } = useTranslation();
  const { data: store, isLoading, error, refetch } = useSellerStore();
  const [sp, setSp] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(sp.get('tab') ?? '') ? sp.get('tab')! : 'branding';
  if (isLoading) return <PageSpinner />;
  if (error || !store) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <>
      <Seo title={t('seller.nav.store')} noindex />
      <SectionHeader
        as="h1"
        title={t('seller.nav.store')}
        description={t('seller.storeSettings.subtitle')}
        action={
          <Button href={`/store/${store.slug}`} target="_blank" rel="noopener" variant="outline" size="sm" rightIcon={<ExternalLink className="size-4" />}>
            {t('seller.builder.preview')}
          </Button>
        }
      />
      <Tabs value={tab} onValueChange={(v) => setSp({ tab: v }, { replace: true })}>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList className="w-max">
            {TABS.map((k) => (
              <TabsTrigger key={k} value={k} className="whitespace-nowrap">
                {t(`seller.storeSettings.tabs.${k}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <Card className="mt-4 p-5 sm:p-6">
          <TabsContent value="branding">
            <BrandingTab store={store} />
          </TabsContent>
          <TabsContent value="layout">
            <LayoutTab store={store} />
          </TabsContent>
          <TabsContent value="policies">
            <PoliciesTab store={store} />
          </TabsContent>
          <TabsContent value="seo">
            <SeoTab store={store} />
          </TabsContent>
          <TabsContent value="holiday">
            <HolidayTab store={store} />
          </TabsContent>
          <TabsContent value="advanced">
            <AdvancedTab store={store} />
          </TabsContent>
          <TabsContent value="account" className="grid gap-5">
            <BusinessCard store={store} canEdit={store.myRole === STORE_ROLES[0]} />
            <PayoutCard store={store} canEdit={store.myPermissions.includes(PERMISSIONS.STORE_FINANCE_MANAGE)} />
          </TabsContent>
        </Card>
      </Tabs>
    </>
  );
}
