import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Heart, LayoutGrid, Search, ShoppingCart } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { CountBadge, IconButton } from '@/components/ui';
import { useCart } from '@/stores/cart';
import { AccountMenu } from './AccountMenu';
import { LanguageSwitcher, ThemeToggle } from './Switchers';

function SearchBar({ className }: { className?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  function submit(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/search?q=${encodeURIComponent(term)}` : '/search');
  }
  return (
    <form role="search" onSubmit={submit} className={className}>
      <label htmlFor="site-search" className="sr-only">
        {t('header.searchLabel')}
      </label>
      <div className="group relative flex h-12 items-center rounded-pill border border-border-strong bg-surface shadow-sm transition-[border-color,box-shadow] focus-within:border-primary-600 focus-within:ring-4 focus-within:ring-primary/15">
        <Search className="pointer-events-none ms-4 size-[18px] shrink-0 text-fg-subtle" aria-hidden />
        <input
          id="site-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('header.searchPlaceholder')}
          autoComplete="off"
          enterKeyHint="search"
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-fg placeholder:text-fg-subtle focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        <button
          type="submit"
          className="me-1 inline-flex h-10 items-center gap-2 rounded-pill bg-primary px-4 text-sm font-semibold text-primary-fg transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-5"
        >
          <span className="hidden sm:inline">{t('header.search')}</span>
          <Search className="size-4 sm:hidden" aria-hidden />
          <span className="sr-only sm:hidden">{t('header.search')}</span>
        </button>
      </div>
    </form>
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

        <Link
          to="/categories"
          className="ms-2 hidden h-11 shrink-0 items-center gap-2 rounded-pill border border-border bg-surface px-4 text-sm font-semibold text-fg transition hover:border-border-strong hover:bg-surface-2 lg:inline-flex"
        >
          <LayoutGrid className="size-4 text-primary-700" />
          {t('nav.categories')}
        </Link>

        <SearchBar className="mx-2 hidden flex-1 md:block" />
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
          <span className="relative hidden md:inline-flex">
            <IconButton label={t('nav.cartCount', { count })} to="/cart">
              <ShoppingCart className="size-[18px]" />
            </IconButton>
            <CountBadge count={count} />
          </span>
          <AccountMenu />
        </nav>
      </div>
      <div className="px-4 pb-3 md:hidden">
        <SearchBar />
      </div>
    </header>
  );
}
