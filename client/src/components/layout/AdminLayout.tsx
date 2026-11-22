import { useTranslation } from 'react-i18next';
import {
  FileText,
  Gavel,
  LayoutDashboard,
  Landmark,
  Package,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  UserRound,
  Users,
} from 'lucide-react';
import { DashboardShell, type DashNavItem } from './DashboardShell';

export default function AdminLayout() {
  const { t } = useTranslation();
  // `ready: false` items are built in later phases and stay hidden until then.
  const nav: DashNavItem[] = [
    { to: '/admin', label: t('admin.nav.overview'), icon: LayoutDashboard, end: true, ready: true },
    { to: '/admin/users', label: t('admin.nav.users'), icon: Users, ready: false },
    { to: '/admin/stores', label: t('admin.nav.stores'), icon: Store, ready: false },
    { to: '/admin/products', label: t('admin.nav.products'), icon: Package, ready: false },
    { to: '/admin/orders', label: t('admin.nav.orders'), icon: ShoppingBag, ready: false },
    { to: '/admin/disputes', label: t('admin.nav.disputes'), icon: Gavel, ready: false },
    { to: '/admin/finance', label: t('admin.nav.finance'), icon: Landmark, ready: false },
    { to: '/admin/cms', label: t('admin.nav.cms'), icon: FileText, ready: false },
    { to: '/admin/settings', label: t('admin.nav.settings'), icon: Settings, ready: false },
    { to: '/admin/profile', label: t('admin.nav.profile'), icon: UserRound, ready: true },
    { to: '/admin/security', label: t('admin.nav.security'), icon: ShieldCheck, ready: true },
  ];
  return <DashboardShell area="admin" areaLabel={t('nav.adminPanel')} nav={nav} />;
}
