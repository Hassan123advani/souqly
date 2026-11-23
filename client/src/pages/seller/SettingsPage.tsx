import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS } from '@souqly/shared';
import { Seo } from '@/components/layout/Seo';
import { Card, SectionHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { ChatTab, NotificationsTab } from '@/components/seller/settings/NotifyChatTabs';
import { ShippingTab } from '@/components/seller/settings/ShippingTab';
import { useCan } from '@/components/seller/usePermissions';

export default function SettingsPage() {
  const { t } = useTranslation();
  const can = useCan();
  const [sp, setSp] = useSearchParams();
  const tabs = [
    ...(can(PERMISSIONS.STORE_SETTINGS_MANAGE) ? (['shipping', 'notifications'] as const) : []),
    ...(can(PERMISSIONS.STORE_CHAT_MANAGE) ? (['chat'] as const) : []),
  ];
  const tab = tabs.find((x) => x === sp.get('tab')) ?? tabs[0];
  return (
    <>
      <Seo title={t('seller.nav.settings')} noindex />
      <SectionHeader as="h1" title={t('seller.nav.settings')} description={t('seller.settings.subtitle')} />
      {tab && (
        <Tabs value={tab} onValueChange={(v) => setSp({ tab: v }, { replace: true })}>
          <TabsList>
            {tabs.map((k) => (
              <TabsTrigger key={k} value={k} className="whitespace-nowrap">
                {t(`seller.settings.tabs.${k}`)}
              </TabsTrigger>
            ))}
          </TabsList>
          <Card className="mt-4 p-5 sm:p-6">
            <TabsContent value="shipping">
              <ShippingTab />
            </TabsContent>
            <TabsContent value="notifications">
              <NotificationsTab />
            </TabsContent>
            <TabsContent value="chat">
              <ChatTab />
            </TabsContent>
          </Card>
        </Tabs>
      )}
    </>
  );
}
