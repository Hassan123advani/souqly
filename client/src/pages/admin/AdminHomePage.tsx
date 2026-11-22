import { useTranslation } from 'react-i18next';
import { BarChart3, KeyRound, ShieldAlert, ShieldCheck, UserCog } from 'lucide-react';
import { useMe } from '@/api/auth';
import { Seo } from '@/components/layout/Seo';
import { Badge, Button, Card, EmptyState, SectionHeader } from '@/components/ui';

export default function AdminHomePage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  if (!me) return null;
  const secure = !me.passwordChangeRecommended && me.twoFactorEnabled;
  return (
    <>
      <Seo title={t('nav.adminPanel')} noindex />
      <SectionHeader as="h1" eyebrow={t('nav.adminPanel')} title={t('admin.home.greeting', { name: me.name.split(' ')[0] })} />
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <UserCog className="size-5 text-primary-700" />
          <p className="mt-3 text-xs font-medium text-fg-muted">{t('admin.home.role')}</p>
          <p className="latin mt-1 text-lg font-extrabold text-fg">{me.platformRole}</p>
        </Card>
        <Card className="p-5">
          <KeyRound className="size-5 text-primary-700" />
          <p className="mt-3 text-xs font-medium text-fg-muted">{t('admin.home.permissions')}</p>
          <p className="mt-1 text-lg font-extrabold text-fg tabular">{me.permissions.length}</p>
        </Card>
        <Card className="p-5">
          {secure ? <ShieldCheck className="size-5 text-success" /> : <ShieldAlert className="size-5 text-sale-600" />}
          <p className="mt-3 text-xs font-medium text-fg-muted">{t('admin.home.security')}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tone={secure ? 'success' : 'danger'}>{secure ? t('admin.home.secure') : t('admin.home.needsAttention')}</Badge>
            {!secure && (
              <Button to="/admin/security" variant="link" size="sm">
                {t('admin.home.review')}
              </Button>
            )}
          </div>
        </Card>
      </div>
      <Card className="mt-6">
        <EmptyState icon={<BarChart3 />} title={t('coming.releaseTitle')} description={t('admin.home.coming')} />
      </Card>
    </>
  );
}
