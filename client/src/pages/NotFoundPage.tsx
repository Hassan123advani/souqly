import { useTranslation } from 'react-i18next';
import { Home, LifeBuoy } from 'lucide-react';
import { Seo } from '@/components/layout/Seo';
import { Button, Container } from '@/components/ui';

export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <Container className="grid min-h-[60vh] place-items-center py-16">
      <Seo title={t('notFound.title')} noindex />
      <div className="text-center">
        <div className="relative mx-auto h-44 w-40" aria-hidden>
          {/* An empty souq doorway with a single lantern. */}
          <svg viewBox="0 0 160 176" className="size-full">
            <path
              d="M14 176V84C14 46 42 20 80 4c38 16 66 42 66 80v92"
              className="fill-primary-50 stroke-primary-300"
              strokeWidth="2"
            />
            <path d="M34 176V90c0-28 18-48 46-62 28 14 46 34 46 62v86" className="fill-bg stroke-primary-200" strokeWidth="2" strokeDasharray="6 6" />
            <line x1="80" y1="28" x2="80" y2="58" className="stroke-accent-600" strokeWidth="1.5" />
            <rect x="71" y="58" width="18" height="26" rx="6" className="fill-accent" />
            <circle cx="80" cy="71" r="20" className="fill-accent/20 animate-glow" />
          </svg>
        </div>
        <p className="latin mt-4 text-sm font-bold tracking-[0.3em] text-accent-700">404</p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">{t('notFound.title')}</h1>
        <p className="mx-auto mt-2 max-w-md text-fg-muted">{t('notFound.body')}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button to="/" leftIcon={<Home className="size-4" />}>
            {t('notFound.home')}
          </Button>
          <Button to="/help" variant="outline" leftIcon={<LifeBuoy className="size-4" />}>
            {t('notFound.help')}
          </Button>
        </div>
      </div>
    </Container>
  );
}
