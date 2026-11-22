import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/layout/Seo';
import { Breadcrumbs, Container } from '@/components/ui';

type Section = { h: string; p: string };

/** Long-form content pages (About, Terms, Privacy). Copy lives in the locale files. */
export default function StaticPage({ page }: { page: 'about' | 'terms' | 'privacy' }) {
  const { t } = useTranslation();
  const sections = t(`static.${page}.sections`, { returnObjects: true }) as Section[];
  const title = t(`static.${page}.title`);
  return (
    <>
      <Seo title={title} description={t(`static.${page}.intro`)} />
      <div className="border-b border-border bg-surface">
        <Container className="relative overflow-hidden py-10 sm:py-14">
          <div className="souq-pattern pointer-events-none absolute inset-y-0 end-0 w-1/2 opacity-60 [mask-image:linear-gradient(90deg,transparent,#000)] rtl:[mask-image:linear-gradient(270deg,transparent,#000)]" />
          <Breadcrumbs items={[{ label: t('nav.home'), to: '/' }, { label: title }]} />
          <h1 className="relative mt-4 text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">{title}</h1>
          <p className="relative mt-3 max-w-2xl text-base text-fg-muted sm:text-lg">{t(`static.${page}.intro`)}</p>
          {page !== 'about' && <p className="relative mt-4 text-xs text-fg-subtle">{t('static.updated')}</p>}
        </Container>
      </div>
      <Container className="py-10 sm:py-14">
        <div className="mx-auto max-w-3xl space-y-8">
          {Array.isArray(sections) &&
            sections.map((s, i) => (
              <section key={s.h} className="flex gap-4">
                <span className="latin mt-0.5 grid size-8 shrink-0 place-items-center rounded-t-[1rem] rounded-b-md bg-primary-50 text-xs font-bold text-primary-700">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h2 className="text-lg font-bold text-fg">{s.h}</h2>
                  <p className="mt-2 leading-relaxed text-fg-muted">{s.p}</p>
                </div>
              </section>
            ))}
        </div>
      </Container>
    </>
  );
}
