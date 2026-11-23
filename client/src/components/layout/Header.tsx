import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as Dialog from '@radix-ui/react-dialog';
import { Heart, Search, ShoppingCart } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { CountBadge, IconButton } from '@/components/ui';
import { CategoryMenu } from '@/components/catalog/CategoryMenu';
import { SearchBox } from '@/components/catalog/SearchBox';
import { useCart } from '@/stores/cart';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { HeaderChatLink } from '@/components/chat/HeaderChatLink';
import { AccountMenu } from './AccountMenu';
import { LanguageSwitcher, ThemeToggle } from './Switchers';

/** Mobile: a search "field" that opens a full-screen search overlay. */
function MobileSearch() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const current = pathname === '/search' ? params.get('q') ?? '' : '';
  useEffect(() => setOpen(false), [pathname]);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="flex h-11 w-full items-center gap-3 rounded-pill border border-border-strong bg-surface px-4 text-start text-sm shadow-sm"
        >
          <Search className="size-[18px] shrink-0 text-fg-subtle" aria-hidden />
          <span className={current ? 'truncate text-fg' : 'truncate text-fg-subtle'}>{current || t('header.searchPlaceholder')}</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content className="fixed inset-0 z-[70] flex flex-col bg-bg animate-fade-in focus:outline-none">
          <Dialog.Title className="sr-only">{t('header.searchLabel')}</Dialog.Title>
          <Dialog.Description className="sr-only">{t('header.searchPlaceholder')}</Dialog.Description>
          <SearchBox overlay onDone={() => setOpen(false)} className="min-h-0 flex-1" />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Header() {
  const { t } = useTranslation();
  const count = useCart((s) => s.count);
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-bg/85 backdrop-blur-xl supports-[backdrop-filter]:bg-bg/75">
      <div className="mx-auto flex h-16 w-full max-w-[1320px] items-center gap-2 px-4 sm:gap-4 sm:px-6 lg:h-[72px] lg:px-8">
        <Link to="/" className="shrink-0 rounded-md" aria-label={t('nav.home')}>
          <Logo markClassName="size-9" showArabic={false} className="sm:hidden" />
          <Logo markClassName="size-10" className="hidden sm:inline-flex" />
        </Link>

        <CategoryMenu />

        <SearchBox className="mx-2 hidden flex-1 md:block" />
        <div className="flex-1 md:hidden" />

        <nav className="flex items-center gap-0.5 sm:gap-1" aria-label={t('nav.utility')}>
          <span className="hidden sm:inline-flex">
            <LanguageSwitcher />
          </span>
          <span className="sm:hidden">
            <LanguageSwitcher compact />
          </span>
          <ThemeToggle />
          <IconButton label={t('nav.wishlist')} to="/wishlist" className="hidden md:inline-flex">
            <Heart className="size-[18px]" />
          </IconButton>
          <HeaderChatLink />
          <span className="relative hidden md:inline-flex">
            <IconButton label={t('nav.cartCount', { count })} to="/cart">
              <ShoppingCart className="size-[18px]" />
            </IconButton>
            <CountBadge count={count} />
          </span>
          <NotificationBell />
          <AccountMenu />
        </nav>
      </div>
      <div className="px-4 pb-3 md:hidden">
        <MobileSearch />
      </div>
    </header>
  );
}
