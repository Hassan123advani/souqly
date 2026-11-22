import { useTranslation } from 'react-i18next';
import { ArrowRight, BarChart3, MessageSquare, Percent, ShieldCheck, Truck, Users } from 'lucide-react';
import { useMe } from '@/api/auth';
import { Seo } from '@/components/layout/Seo';
import { Button, Container, SectionHeader } from '@/components/ui';

export default function SellPage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const cta = me ? '/seller/onboarding' : `/signup?next=${encodeURIComponent('/seller/onboarding')}`;
  const benefits = [
    { icon: Percent, key: 'fees' },
    { icon: Truck, key: 'cod' },
    { icon: MessageSquare, key: 'chat' },
    { icon: BarChart3, key: 'insights' },
    { icon: Users, key: 'team' },
    { icon: ShieldCheck, key: 'payouts' },
  ];
  const steps = ['1', '2', '3'];
  return (
    <>
      <Seo title={t('static.sell.title')} description={t('static.sell.intro')} />
      <Container className="pt-4 sm:pt-6">
        <section className="dark relative overflow-hidden rounded-xl bg-[#0B2826] text-fg">
          <div className="absolute inset-0 bg-[radial-gradient(60%_80%_at_100%_0%,rgba(242,169,59,.3),transparent_60%)]" />
          <div className="souq-pattern absolute inset-0 opacity-50" />
          <div className="relative max-w-2xl px-6 py-12 sm:px-12 sm:py-16">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">{t('static.sell.eyebrow')}</p>
            <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-ink-950 sm:text-5xl">{t('static.sell.title')}</h1>
            <p className="mt-4 text-fg-muted sm:text-lg">{t('static.sell.intro')}</p>
            <Button to={cta} variant="accent" size="lg" className="mt-7" rightIcon={<ArrowRight className="flip-rtl size-4" />}>
              {t('static.sell.cta')}
            </Button>
          </div>
        </section>

        <section className="mt-14">
          <SectionHeader title={t('static.sell.whyTitle')} eyebrow={t('static.sell.whyEyebrow')} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map(({ icon: Icon, key }) => (
              <div key={key} className="rounded-lg border border-border bg-surface p-5">
                <span className="grid size-11 place-items-center rounded-t-[1.4rem] rounded-b-md bg-primary-50 text-primary-700">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-4 font-bold text-fg">{t(`static.sell.benefits.${key}.title`)}</h3>
                <p className="mt-1 text-sm text-fg-muted">{t(`static.sell.benefits.${key}.body`)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <SectionHeader title={t('static.sell.stepsTitle')} eyebrow={t('static.sell.stepsEyebrow')} />
          <ol className="grid gap-3 md:grid-cols-3">
            {steps.map((s) => (
              <li key={s} className="relative rounded-lg border border-border bg-surface p-5">
                <span className="latin text-4xl font-extrabold text-accent/70">0{s}</span>
                <h3 className="mt-2 font-bold text-fg">{t(`static.sell.steps.${s}.title`)}</h3>
                <p className="mt-1 text-sm text-fg-muted">{t(`static.sell.steps.${s}.body`)}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex justify-center">
            <Button to={cta} size="lg" rightIcon={<ArrowRight className="flip-rtl size-4" />}>
              {t('static.sell.cta')}
            </Button>
          </div>
        </section>
      </Container>
    </>
  );
}
