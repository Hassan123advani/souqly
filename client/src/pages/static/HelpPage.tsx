import { useTranslation } from 'react-i18next';
import { ChevronDown, Mail, MessageCircle, Store } from 'lucide-react';
import { Seo } from '@/components/layout/Seo';
import { Breadcrumbs, Button, Container } from '@/components/ui';

type Faq = { q: string; a: string };

export default function HelpPage() {
  const { t } = useTranslation();
  const faqs = t('static.help.faqs', { returnObjects: true }) as Faq[];
  return (
    <>
      <Seo title={t('static.help.title')} description={t('static.help.intro')} />
      <div className="border-b border-border bg-surface">
        <Container className="py-10 sm:py-14">
          <Breadcrumbs items={[{ label: t('nav.home'), to: '/' }, { label: t('static.help.title') }]} />
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">{t('static.help.title')}</h1>
          <p className="mt-3 max-w-2xl text-fg-muted sm:text-lg">{t('static.help.intro')}</p>
        </Container>
      </div>
      <Container className="grid gap-10 py-10 sm:py-14 lg:grid-cols-[1fr_320px]">
        <div>
          <h2 className="mb-4 text-xl font-bold text-fg">{t('static.help.faqTitle')}</h2>
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {Array.isArray(faqs) &&
              faqs.map((f) => (
                <details key={f.q} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold text-fg hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <ChevronDown className="size-4 shrink-0 text-fg-muted transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="px-5 pb-5 text-sm leading-relaxed text-fg-muted">{f.a}</p>
                </details>
              ))}
          </div>
        </div>
        <aside className="space-y-3">
          <div className="rounded-lg border border-border bg-surface p-5">
            <MessageCircle className="size-6 text-primary-700" />
            <h3 className="mt-3 font-bold text-fg">{t('static.help.chatTitle')}</h3>
            <p className="mt-1 text-sm text-fg-muted">{t('static.help.chatBody')}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-5">
            <Mail className="size-6 text-primary-700" />
            <h3 className="mt-3 font-bold text-fg">{t('static.help.emailTitle')}</h3>
            <p className="mt-1 text-sm text-fg-muted">{t('static.help.emailBody')}</p>
            <a href="mailto:support@souqly.pk" className="link latin mt-2 inline-block text-sm">
              support@souqly.pk
            </a>
          </div>
          <div className="rounded-lg border border-accent-100 bg-accent-50 p-5">
            <Store className="size-6 text-accent-700" />
            <h3 className="mt-3 font-bold text-fg">{t('static.help.sellerTitle')}</h3>
            <p className="mt-1 text-sm text-fg-muted">{t('static.help.sellerBody')}</p>
            <Button to="/sell" size="sm" variant="outline" className="mt-3">
              {t('static.help.sellerCta')}
            </Button>
          </div>
        </aside>
      </Container>
    </>
  );
}
