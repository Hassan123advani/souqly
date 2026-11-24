import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS } from '@souqly/shared';
import { Seo } from '@/components/layout/Seo';
import { StorePermGate } from '@/components/seller/growth/gates';
import { SectionHeader } from '@/components/ui';
import { cn } from '@/lib/cn';
import { COMMISSION_PCT } from '@/lib/rates';

const TABS = [
  { to: '/seller/billing', key: 'overview', end: true },
  { to: '/seller/billing/plans', key: 'plans' },
  { to: '/seller/billing/invoices', key: 'invoices' },
  { to: '/seller/billing/payments', key: 'payments' },
  { to: '/seller/billing/commissions', key: 'commissions' },
  { to: '/seller/billing/payouts', key: 'payouts' },
] as const;

/** Seller Center "Billing & finance": tab strip over the billing sub-pages. */
export default function BillingLayout() {
  const { t } = useTranslation();
  return (
    <StorePermGate perm={PERMISSIONS.STORE_FINANCE_VIEW}>
      <Seo title={t('billing.nav')} noindex />
      <SectionHeader as="h1" title={t('billing.nav')} description={t('billing.subtitle', { pct: COMMISSION_PCT })} />
      <nav aria-label={t('billing.nav')} className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-1 border-b border-border">
          {TABS.map((tab) => (
            <NavLink
              key={tab.key}
              to={tab.to}
              end={'end' in tab ? tab.end : false}
              className={({ isActive }) =>
                cn(
                  '-mb-px flex h-10 items-center whitespace-nowrap border-b-2 px-3 text-sm font-semibold transition-colors',
                  isActive ? 'border-primary text-primary-800' : 'border-transparent text-fg-muted hover:text-fg',
                )
              }
            >
              {t(`billing.tabs.${tab.key}`)}
            </NavLink>
          ))}
        </div>
      </nav>
      <Outlet />
    </StorePermGate>
  );
}
