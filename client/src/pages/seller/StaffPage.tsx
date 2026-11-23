import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/layout/Seo';
import { Card, SectionHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { ActivityTab } from '@/components/seller/staff/ActivityTab';
import { MembersTab } from '@/components/seller/staff/MembersTab';
import { RolesTab } from '@/components/seller/staff/RolesTab';

const TABS = ['members', 'roles', 'activity'] as const;

export default function StaffPage() {
  const { t } = useTranslation();
  const [sp, setSp] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(sp.get('tab') ?? '') ? sp.get('tab')! : 'members';
  return (
    <>
      <Seo title={t('seller.nav.staff')} noindex />
      <SectionHeader as="h1" title={t('seller.nav.staff')} description={t('seller.staff.subtitle')} />
      <Tabs value={tab} onValueChange={(v) => setSp({ tab: v }, { replace: true })}>
        <TabsList>
          {TABS.map((k) => (
            <TabsTrigger key={k} value={k} className="whitespace-nowrap">
              {t(`seller.staff.tabs.${k}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <Card className="mt-4 p-5 sm:p-6">
          <TabsContent value="members">
            <MembersTab />
          </TabsContent>
          <TabsContent value="roles">
            <RolesTab />
          </TabsContent>
          <TabsContent value="activity">
            <ActivityTab />
          </TabsContent>
        </Card>
      </Tabs>
    </>
  );
}
