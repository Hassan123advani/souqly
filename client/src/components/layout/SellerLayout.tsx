import { useTranslation } from 'react-i18next';
import {
  BadgePercent,
  BarChart3,
  Boxes,
  LayoutDashboard,
  MessageSquare,
  Package,
  Settings,
  ShoppingBag,
  Users,
  Wallet,
} from 'lucide-react';
import { DashboardShell, type DashNavItem } from './DashboardShell';

export default function SellerLayout() {
  const { t } = useTranslation();
  // `ready: false` items are built in later phases and stay hidden until then.
  const nav: DashNavItem[] = [
    { to: '/seller', label: t('seller.nav.dashboard'), icon: LayoutDashboard, end: true, ready: true },
    { to: '/seller/products', label: t('seller.nav.products'), icon: Package, ready: false },
    { to: '/seller/inventory', label: t('seller.nav.inventory'), icon: Boxes, ready: false },
    { to: '/seller/orders', label: t('seller.nav.orders'), icon: ShoppingBag, ready: false },
    { to: '/seller/marketing', label: t('seller.nav.marketing'), icon: BadgePercent, ready: false },
    { to: '/seller/chat', label: t('seller.nav.chat'), icon: MessageSquare, ready: false },
    { to: '/seller/finance', label: t('seller.nav.finance'), icon: Wallet, ready: false },
    { to: '/seller/analytics', label: t('seller.nav.analytics'), icon: BarChart3, ready: false },
    { to: '/seller/staff', label: t('seller.nav.staff'), icon: Users, ready: false },
    { to: '/seller/settings', label: t('seller.nav.settings'), icon: Settings, ready: false },
  ];
  return <DashboardShell area="seller" areaLabel={t('nav.sellerCenter')} nav={nav} />;
}
