import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, LayoutGrid, MessageCircle, ShoppingCart, UserRound } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useCart } from '@/stores/cart';
import { CountBadge } from '@/components/ui';

export function BottomNav() {
  const { t } = useTranslation();
  const count = useCart((s) => s.count);
  const items = [
    { to: '/', label: t('nav.home'), icon: Home, end: true },
    { to: '/categories', label: t('nav.categories'), icon: LayoutGrid },
    { to: '/cart', label: t('nav.cart'), icon: ShoppingCart, badge: count },
    { to: '/chat', label: t('nav.chat'), icon: MessageCircle },
    { to: '/account', label: t('nav.account'), icon: UserRound },
  ];
  return (
    <nav
      aria-label={t('nav.primary')}
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur-xl md:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map(({ to, label, icon: Icon, end, badge }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors',
                  isActive ? 'text-primary-700' : 'text-fg-subtle hover:text-fg',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'absolute top-0 h-[3px] w-8 rounded-b-full bg-accent transition-opacity',
                      isActive ? 'opacity-100' : 'opacity-0',
                    )}
                    aria-hidden
                  />
                  <span className="relative">
                    <Icon className={cn('size-[22px]', isActive && 'stroke-[2.4]')} />
                    {badge ? <CountBadge count={badge} className="-end-2.5 -top-1.5" /> : null}
                  </span>
                  <span className="leading-none">{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
