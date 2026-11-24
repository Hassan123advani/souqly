import { useTranslation } from 'react-i18next';
import {
  BadgePercent,
  BarChart3,
  Bike,
  Boxes,
  LayoutDashboard,
  MessageSquare,
  Package,
  ScanBarcode,
  Undo2,
  Settings,
  ShoppingBag,
  Star,
  Store,
  Users,
  Wallet,
} from 'lucide-react';
import { PERMISSIONS } from '@souqly/shared';
import { useLowStockCount, useSellerStore } from '@/api/seller';
import { useChatUnread } from '@/api/chat';
import { SellerSidebarFooter } from '@/components/seller/StoreSwitcher';
import { DashboardShell, type DashNavItem } from './DashboardShell';

export default function SellerLayout() {
  const { t } = useTranslation();
  const { data: store } = useSellerStore();
  const perms = store?.myPermissions ?? [];
  const can = (p: string) => perms.includes(p);
  const active = store?.status === 'approved' || store?.status === 'pending';
  const chatUnread = useChatUnread('store', active && can(PERMISSIONS.STORE_CHAT_MANAGE));
  const { data: lowStock } = useLowStockCount(active && can(PERMISSIONS.STORE_PRODUCTS_VIEW));
  // `ready: false` items are built in later phases (or not permitted) and stay hidden.
  const nav: DashNavItem[] = [
    { to: '/seller', label: t('seller.nav.dashboard'), icon: LayoutDashboard, end: true, ready: true, tourId: 'dashboard' },
    { to: '/seller/orders', label: t('seller.nav.orders'), icon: ShoppingBag, ready: active && can(PERMISSIONS.STORE_ORDERS_VIEW), tourId: 'orders' },
    { to: '/seller/returns', label: t('returns.seller.nav'), icon: Undo2, ready: active && can(PERMISSIONS.STORE_ORDERS_VIEW) },
    { to: '/seller/riders', label: t('rider.seller.nav'), icon: Bike, ready: active && can(PERMISSIONS.STORE_ORDERS_VIEW) },
    { to: '/seller/products', label: t('seller.nav.products'), icon: Package, ready: active && can(PERMISSIONS.STORE_PRODUCTS_VIEW), tourId: 'products' },
    {
      to: '/seller/inventory',
      label: t('seller.nav.inventory'),
      icon: Boxes,
      ready: active && can(PERMISSIONS.STORE_PRODUCTS_VIEW),
      badge: lowStock,
      tourId: 'inventory',
    },
    { to: '/seller/store', label: t('seller.nav.store'), icon: Store, ready: active && can(PERMISSIONS.STORE_SETTINGS_MANAGE), tourId: 'store' },
    { to: '/seller/marketing', label: t('seller.nav.marketing'), icon: BadgePercent, ready: active && can(PERMISSIONS.STORE_MARKETING_MANAGE) },
    { to: '/seller/pos', label: t('growth.pos.nav'), icon: ScanBarcode, ready: active && can(PERMISSIONS.STORE_POS_USE) },
    { to: '/seller/chat', label: t('seller.nav.chat'), icon: MessageSquare, ready: active && can(PERMISSIONS.STORE_CHAT_MANAGE), badge: chatUnread },
    {
      to: '/seller/reviews',
      label: t('reviews.seller.nav'),
      icon: Star,
      ready: active && (can(PERMISSIONS.STORE_ORDERS_VIEW) || can(PERMISSIONS.STORE_CHAT_MANAGE)),
    },
    { to: '/seller/billing', label: t('billing.nav'), icon: Wallet, ready: active && can(PERMISSIONS.STORE_FINANCE_VIEW) },
    { to: '/seller/analytics', label: t('seller.nav.analytics'), icon: BarChart3, ready: active && can(PERMISSIONS.STORE_ANALYTICS_VIEW) },
    { to: '/seller/staff', label: t('seller.nav.staff'), icon: Users, ready: active && can(PERMISSIONS.STORE_STAFF_MANAGE), tourId: 'staff' },
    {
      to: '/seller/settings',
      label: t('seller.nav.settings'),
      icon: Settings,
      ready: active && (can(PERMISSIONS.STORE_SETTINGS_MANAGE) || can(PERMISSIONS.STORE_CHAT_MANAGE)),
      tourId: 'settings',
    },
  ];
  return <DashboardShell area="seller" areaLabel={t('nav.sellerCenter')} nav={nav} sidebarFooter={<SellerSidebarFooter />} />;
}
