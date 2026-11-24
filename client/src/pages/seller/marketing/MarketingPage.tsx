import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Gift, Image, Megaphone, Package, Star, Ticket, Zap } from 'lucide-react';
import { PERMISSIONS } from '@souqly/shared';
import { Seo } from '@/components/layout/Seo';
import { SectionHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { StorePermGate } from '@/components/seller/growth/gates';
import { BundlesTab } from '@/components/seller/marketing/BundlesTab';
import { CampaignsTab } from '@/components/seller/marketing/CampaignsTab';
import { FeaturedTab } from '@/components/seller/marketing/FeaturedTab';
import { FlashDealsTab } from '@/components/seller/marketing/FlashDealsTab';
import { PromotionsTab } from '@/components/seller/marketing/PromotionsTab';
import { ShareTab } from '@/components/seller/marketing/ShareTab';
import { VouchersTab } from '@/components/seller/marketing/VouchersTab';

const TABS = ['vouchers', 'deals', 'bundles', 'bxgy', 'campaigns', 'featured', 'share'] as const;
type Tab = (typeof TABS)[number];
const ICONS: Record<Tab, typeof Ticket> = { vouchers: Ticket, deals: Zap, bundles: Package, bxgy: Gift, campaigns: Megaphone, featured: Star, share: Image };

export default function MarketingPage() {
  const { t } = useTranslation();
  const [sp, setSp] = useSearchParams();
  const raw = sp.get('tab') as Tab | null;
  const tab: Tab = raw && TABS.includes(raw) ? raw : 'vouchers';
  return (
    <>
      <Seo title={t('seller.nav.marketing')} noindex />
      <SectionHeader as="h1" title={t('seller.nav.marketing')} description={t('growth.marketing.subtitle')} />
      <StorePermGate perm={PERMISSIONS.STORE_MARKETING_MANAGE}>
        <Tabs value={tab} onValueChange={(v) => setSp({ tab: v }, { replace: true })}>
          <div className="no-scrollbar -mx-4 overflow-x-auto px-4">
            <TabsList className="w-max min-w-full">
              {TABS.map((k) => {
                const Icon = ICONS[k];
                return (
                  <TabsTrigger key={k} value={k} icon={<Icon className="size-4" />} className="flex-none sm:flex-1">
                    {t(`growth.marketing.tabs.${k}`)}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>
          <TabsContent value="vouchers">
            <VouchersTab />
          </TabsContent>
          <TabsContent value="deals">
            <FlashDealsTab />
          </TabsContent>
          <TabsContent value="bundles">
            <BundlesTab />
          </TabsContent>
          <TabsContent value="bxgy">
            <PromotionsTab />
          </TabsContent>
          <TabsContent value="campaigns">
            <CampaignsTab />
          </TabsContent>
          <TabsContent value="featured">
            <FeaturedTab />
          </TabsContent>
          <TabsContent value="share">
            <ShareTab />
          </TabsContent>
        </Tabs>
      </StorePermGate>
    </>
  );
}
