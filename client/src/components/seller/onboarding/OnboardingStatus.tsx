import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock, Package, ShieldCheck } from 'lucide-react';
import { Seo } from '@/components/layout/Seo';
import { Badge, Button, Card, Container } from '@/components/ui';

/** Shown after submitting (and whenever an existing seller opens /seller/onboarding). */
export function OnboardingStatus({ status, storeName }: { status: string; storeName: string }) {
  const { t } = useTranslation();
  const steps = [
    { icon: CheckCircle2, key: 'submitted', done: true },
    { icon: ShieldCheck, key: 'review', done: status === 'approved' },
    { icon: Package, key: 'products', done: false },
  ];
  return (
    <Container className="max-w-2xl py-10 sm:py-16">
      <Seo title={t('seller.done.title')} noindex />
      <Card className="p-6 text-center sm:p-10">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-accent-50 text-accent-700">
          <Clock className="size-8" />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold text-fg">{status === 'pending' ? t('seller.done.title') : storeName}</h1>
        <div className="mt-2 flex justify-center">
          <Badge tone={status === 'approved' ? 'success' : status === 'pending' ? 'warning' : 'danger'}>{t(`storeStatus.${status}`, status)}</Badge>
        </div>
        <p className="mx-auto mt-3 max-w-md text-fg-muted">{t('seller.done.body', { store: storeName })}</p>
        <ol className="mx-auto mt-6 grid max-w-sm gap-3 text-start">
          {steps.map(({ icon: Icon, key, done }) => (
            <li key={key} className="flex items-start gap-3">
              <Icon className={done ? 'mt-0.5 size-5 shrink-0 text-success' : 'mt-0.5 size-5 shrink-0 text-fg-subtle'} />
              <div>
                <p className="text-sm font-semibold text-fg">{t(`seller.done.steps.${key}.title`)}</p>
                <p className="text-xs text-fg-muted">{t(`seller.done.steps.${key}.body`)}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Button to="/seller" size="lg">
            {t('seller.done.goToCenter')}
          </Button>
          <Button to="/seller/products/new" variant="outline" size="lg">
            {t('seller.done.addProduct')}
          </Button>
        </div>
      </Card>
    </Container>
  );
}
