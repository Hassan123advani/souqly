import { Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Logo, LogoMark } from '@/components/brand/Logo';
import { IconButton, PageSpinner, Sheet, Tooltip } from '@/components/ui';
import { cn } from '@/lib/cn';
import { AccountMenu } from './AccountMenu';
import { LanguageSwitcher, ThemeToggle } from './Switchers';
import { OfflineNotice, SecurityBanner } from './Banners';

export type DashNavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  end?: boolean;
  /** Items whose page is not built yet stay hidden so nothing looks broken. */
  ready: boolean;
};

type ShellProps = {
  /** localStorage key for the collapsed state, e.g. "seller" or "admin". */
  area: 'seller' | 'admin';
  areaLabel: string;
  nav: DashNavItem[];
  sidebarFooter?: ReactNode;
};

function readCollapsed(area: string) {
  try {
    return localStorage.getItem(`souqly-sidebar-${area}`) === '1';
  } catch {
    return false;
  }
}

function NavList({ items, collapsed, onNavigate }: { items: DashNavItem[]; collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map(({ to, label, icon: Icon, end }) => (
        <li key={to}>
          <Tooltip content={label} side="right" disabled={!collapsed}>
            <NavLink
              to={to}
              end={end}
              onClick={onNavigate}
              aria-label={collapsed ? label : undefined}
              className={({ isActive }) =>
                cn(
                  'group relative flex h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold transition-colors',
                  collapsed && 'justify-center px-0',
                  isActive ? 'bg-primary-50 text-primary-800' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute inset-y-2 start-0 w-1 rounded-e-full bg-accent" aria-hidden />}
                  <Icon className="size-5 shrink-0" />
                  {!collapsed && <span className="truncate">{label}</span>}
                </>
              )}
            </NavLink>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}

export function DashboardShell({ area, areaLabel, nav, sidebarFooter }: ShellProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(() => readCollapsed(area));
  const [drawer, setDrawer] = useState(false);
  const { pathname } = useLocation();
  const items = nav.filter((n) => n.ready);

  useEffect(() => {
    try {
      localStorage.setItem(`souqly-sidebar-${area}`, collapsed ? '1' : '0');
    } catch {
      /* storage unavailable: keep in-memory state */
    }
  }, [area, collapsed]);

  useEffect(() => setDrawer(false), [pathname]);

  return (
    <div className="flex min-h-dvh bg-bg">
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col border-e border-border bg-surface transition-[width] duration-250 ease-souq lg:flex',
          collapsed ? 'w-[76px]' : 'w-64',
        )}
      >
        <div className={cn('flex h-16 items-center border-b border-border px-4', collapsed && 'justify-center px-0')}>
          <Link to={`/${area}`} aria-label={areaLabel} className="flex items-center gap-2">
            {collapsed ? <LogoMark className="size-9" /> : <Logo markClassName="size-9" showArabic={false} />}
          </Link>
          {!collapsed && (
            <span className="ms-auto rounded-pill bg-accent-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent-800">
              {areaLabel}
            </span>
          )}
        </div>
        <nav aria-label={areaLabel} className="flex-1 overflow-y-auto p-3">
          <NavList items={items} collapsed={collapsed} />
        </nav>
        <div className={cn('flex flex-col gap-1 border-t border-border p-3', collapsed && 'items-center')}>
          {sidebarFooter}
          <Tooltip content={t('dash.backToShop')} side="right" disabled={!collapsed}>
            <Link
              to="/"
              className={cn(
                'flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-fg-muted hover:bg-surface-2 hover:text-fg',
                collapsed && 'justify-center px-0 w-11',
              )}
              aria-label={collapsed ? t('dash.backToShop') : undefined}
            >
              <ArrowLeft className="flip-rtl size-4 shrink-0" />
              {!collapsed && t('dash.backToShop')}
            </Link>
          </Tooltip>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className={cn(
              'flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-fg-muted hover:bg-surface-2 hover:text-fg',
              collapsed && 'w-11 justify-center px-0',
            )}
            aria-label={collapsed ? t('dash.expand') : t('dash.collapse')}
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen className="flip-rtl size-4" /> : <PanelLeftClose className="flip-rtl size-4" />}
            {!collapsed && t('dash.collapse')}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineNotice />
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-bg/85 px-4 backdrop-blur-xl sm:px-6">
          <IconButton label={t('dash.openMenu')} className="lg:hidden" onClick={() => setDrawer(true)}>
            <Menu className="size-5" />
          </IconButton>
          <Link to={`/${area}`} className="lg:hidden" aria-label={areaLabel}>
            <LogoMark className="size-8" />
          </Link>
          <p className="truncate text-sm font-bold text-fg lg:text-base">{areaLabel}</p>
          <div className="ms-auto flex items-center gap-0.5">
            <LanguageSwitcher compact />
            <ThemeToggle />
            <AccountMenu />
          </div>
        </header>
        <SecurityBanner adminArea={area === 'admin'} />
        <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Suspense fallback={<PageSpinner />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <Sheet open={drawer} onOpenChange={setDrawer} side="start" title={areaLabel}>
        <nav aria-label={areaLabel} className="p-3">
          <NavList items={items} onNavigate={() => setDrawer(false)} />
          <div className="mt-3 border-t border-border pt-3">
            {sidebarFooter}
            <Link to="/" className="flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-fg-muted hover:bg-surface-2">
              <ArrowLeft className="flip-rtl size-4" />
              {t('dash.backToShop')}
            </Link>
          </div>
        </nav>
      </Sheet>
    </div>
  );
}
