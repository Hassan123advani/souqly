import { useTranslation } from 'react-i18next';
import { BarChart3, Check, Clock, MessageSquare, Percent, Truck, Users } from 'lucide-react';
import { useMe } from '@/api/auth';
import { Seo } from '@/components/layout/Seo';
import { Alert, Button, Card, Container } from '@/components/ui';

/** The store-creation wizard ships in Phase 5. Until then this page explains the program honestly. */
const WIZARD_READY = false;

export default function SellerOnboardingPage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const benefits = [
    { icon: Percent, key: 'fees' },
    { icon: Truck, key: 'cod' },
    { icon: MessageSquare, key: 'chat' },
    { icon: BarChart3, key: 'insights' },
    { icon: Users, key: 'team' },
  ];
  const checklist = t('onboarding.checklist', { returnObjects: true }) as string[];
  return (
    <Container className="py-8 sm:py-12">
      <Seo title={t('onboarding.title')} noindex />
      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent-700">{t('onboarding.eyebrow')}</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
            {t('onboarding.title')}
          </h1>
          <p className="mt-3 max-w-xl text-fg-muted sm:text-lg">{t('onboarding.body', { name: me?.name.split(' ')[0] ?? '' })}</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {benefits.map(({ icon: Icon, key }) => (
              <div key={key} className="flex gap-3 rounded-lg border border-border bg-surface p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-t-[1.25rem] rounded-b-md bg-primary-50 text-primary-700">
                  <Icon className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-bold text-fg">{t(`static.sell.benefits.${key}.title`)}</p>
                  <p className="mt-0.5 text-xs text-fg-muted">{t(`static.sell.benefits.${key}.body`)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <Card className="h-fit p-6 sm:p-8">
          <h2 className="text-lg font-bold text-fg">{t('onboarding.prepareTitle')}</h2>
          <p className="mt-1 text-sm text-fg-muted">{t('onboarding.prepareBody')}</p>
          <ul className="mt-5 space-y-3">
            {Array.isArray(checklist) &&
              checklist.map((c) => (
                <li key={c} className="flex items-start gap-3 text-sm text-fg">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success-soft text-success">
                    <Check className="size-3.5" />
                  </span>
                  {c}
                </li>
              ))}
          </ul>
          <div className="mt-6">
            {WIZARD_READY ? (
              <Button block size="lg">
                {t('onboarding.start')}
              </Button>
            ) : (
              <Alert tone="info" title={t('onboarding.soonTitle')}>
                <span className="inline-flex items-start gap-1.5">
                  <Clock className="mt-0.5 size-3.5 shrink-0" />
                  {t('onboarding.soonBody')}
                </span>
              </Alert>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button to="/sell" variant="outline" size="sm">
              {t('onboarding.learnMore')}
            </Button>
            <Button to="/" variant="ghost" size="sm">
              {t('onboarding.keepShopping')}
            </Button>
          </div>
        </Card>
      </div>
    </Container>
  );
}
