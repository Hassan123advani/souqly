import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageSpinner } from '@/components/ui';
import { Header } from './Header';
import { Footer } from './Footer';
import { BottomNav } from './BottomNav';
import { AnnouncementBar, BackToTop, OfflineNotice, SecurityBanner } from './Banners';

export function MarketplaceLayout() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-fg focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
      >
        {t('common.skipToContent')}
      </a>
      <OfflineNotice />
      <AnnouncementBar />
      <Header />
      <SecurityBanner />
      <main id="main" className="flex-1 pb-24 md:pb-0">
        <Suspense fallback={<PageSpinner />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
      <BottomNav />
      <BackToTop />
    </div>
  );
}
