import { useTranslation } from 'react-i18next';
import {
  Activity,
  Banknote,
  BarChart3,
  FileText,
  Flag,
  FolderTree,
  Gavel,
  Gift,
  LayoutDashboard,
  LayoutTemplate,
  LifeBuoy,
  Mail,
  Megaphone,
  Package,
  Percent,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tags,
  Ticket,
  UserCog,
  UserRound,
  Users,
  Zap,
} from 'lucide-react';
import { PERMISSIONS, type Permission } from '@souqly/shared';
import { useAdminGet, type AdminDashboard } from '@/api/admin';
import { PasswordChangeModal } from '@/components/admin/PasswordChangeModal';
import { useAdminCan } from '@/components/admin/useAdminCan';
import { DashboardShell, type DashNavItem } from './DashboardShell';

const P = PERMISSIONS;

export default function AdminLayout() {
  const { t } = useTranslation();
  const can = useAdminCan();
  // Queue counts for nav badges (shared cache with the dashboard's default range; refreshed every minute).
  const dash = useAdminGet<AdminDashboard>('dashboard', undefined, { enabled: can(P.ADMIN_DASHBOARD), refetchInterval: 60_000 });
  const pending = dash.data?.pending;
  const g = {
    commerce: t('admin.nav.groups.commerce'),
    catalog: t('admin.nav.groups.catalog'),
    growth: t('admin.nav.groups.growth'),
    finance: t('admin.nav.groups.finance'),
    trust: t('admin.nav.groups.trust'),
    platform: t('admin.nav.groups.platform'),
    account: t('admin.nav.groups.account'),
  };
  const items: (Omit<DashNavItem, 'ready'> & { perm?: Permission })[] = [
    { to: '/admin', label: t('admin.nav.overview'), icon: LayoutDashboard, end: true, perm: P.ADMIN_DASHBOARD },
    { to: '/admin/users', label: t('admin.nav.users'), icon: Users, perm: P.ADMIN_USERS_VIEW, group: g.commerce },
    { to: '/admin/stores', label: t('admin.nav.stores'), icon: Store, perm: P.ADMIN_STORES_VIEW, group: g.commerce, badge: (pending?.stores ?? 0) + (pending?.mallRequests ?? 0) },
    { to: '/admin/products', label: t('admin.nav.products'), icon: Package, perm: P.ADMIN_PRODUCTS_MODERATE, group: g.commerce, badge: pending?.products },
    { to: '/admin/orders', label: t('admin.nav.orders'), icon: ShoppingBag, perm: P.ADMIN_ORDERS_VIEW, group: g.commerce },
    { to: '/admin/disputes', label: t('admin.nav.disputes'), icon: Gavel, perm: P.ADMIN_DISPUTES_MANAGE, group: g.commerce, badge: pending?.disputes },
    { to: '/admin/catalog/categories', label: t('admin.nav.categories'), icon: FolderTree, perm: P.ADMIN_CATALOG_MANAGE, group: g.catalog },
    { to: '/admin/catalog/brands', label: t('admin.nav.brands'), icon: Tags, perm: P.ADMIN_CATALOG_MANAGE, group: g.catalog },
    { to: '/admin/marketing/campaigns', label: t('admin.nav.campaigns'), icon: Megaphone, perm: P.ADMIN_MARKETING_MANAGE, group: g.growth },
    { to: '/admin/marketing/flash-sales', label: t('admin.nav.flashSales'), icon: Zap, perm: P.ADMIN_MARKETING_MANAGE, group: g.growth },
    { to: '/admin/marketing/vouchers', label: t('admin.nav.vouchers'), icon: Ticket, perm: P.ADMIN_MARKETING_MANAGE, group: g.growth },
    { to: '/admin/marketing/gift-cards', label: t('admin.nav.giftCards'), icon: Gift, perm: P.ADMIN_FINANCE_VIEW, group: g.growth },
    { to: '/admin/cms/home', label: t('admin.nav.homeCms'), icon: LayoutTemplate, perm: P.ADMIN_CMS_MANAGE, group: g.growth },
    { to: '/admin/cms/pages', label: t('admin.nav.pages'), icon: FileText, perm: P.ADMIN_CMS_MANAGE, group: g.growth },
    { to: '/admin/finance/payouts', label: t('admin.nav.payouts'), icon: Banknote, perm: P.ADMIN_FINANCE_VIEW, group: g.finance, badge: pending?.payouts },
    { to: '/admin/finance/commission', label: t('admin.nav.commission'), icon: Percent, perm: P.ADMIN_FINANCE_VIEW, group: g.finance },
    { to: '/admin/finance/reports', label: t('admin.nav.reports'), icon: BarChart3, perm: P.ADMIN_FINANCE_VIEW, group: g.finance },
    { to: '/admin/moderation', label: t('admin.nav.moderation'), icon: Flag, perm: P.ADMIN_REVIEWS_MODERATE, group: g.trust, badge: (pending?.reports ?? 0) + (pending?.fraudSignals ?? 0) },
    { to: '/admin/support', label: t('admin.nav.support'), icon: LifeBuoy, perm: P.ADMIN_SUPPORT_MANAGE, group: g.trust, badge: pending?.tickets },
    { to: '/admin/settings', label: t('admin.nav.settings'), icon: Settings, perm: P.ADMIN_SETTINGS_MANAGE, group: g.platform },
    { to: '/admin/settings/email-templates', label: t('admin.nav.emailTemplates'), icon: Mail, perm: P.ADMIN_SETTINGS_MANAGE, group: g.platform },
    { to: '/admin/staff', label: t('admin.nav.staff'), icon: UserCog, perm: P.ADMIN_STAFF_MANAGE, group: g.platform },
    { to: '/admin/audit', label: t('admin.nav.audit'), icon: ScrollText, perm: P.ADMIN_AUDIT_VIEW, group: g.platform },
    { to: '/admin/system', label: t('admin.nav.system'), icon: Activity, perm: P.ADMIN_SYSTEM_VIEW, group: g.platform },
    { to: '/admin/profile', label: t('admin.nav.profile'), icon: UserRound, group: g.account },
    { to: '/admin/security', label: t('admin.nav.security'), icon: ShieldCheck, group: g.account },
  ];
  // Hide what this staff member cannot use (the API enforces the same permissions).
  const nav: DashNavItem[] = items.map(({ perm, ...item }) => ({ ...item, end: item.end ?? item.to === '/admin/settings', ready: !perm || can(perm) }));
  return <DashboardShell area="admin" areaLabel={t('nav.adminPanel')} nav={nav} dense extras={<PasswordChangeModal />} />;
}
