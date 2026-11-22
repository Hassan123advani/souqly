import type { PlatformRole, StoreRole } from './roles';

/**
 * Single source of truth for every permission in Souqly.
 * `admin.*` permissions apply to platform staff; `store.*` permissions apply inside one store.
 */
export const PERMISSIONS = {
  // ---- platform (admin panel) ----
  ADMIN_DASHBOARD: 'admin.dashboard.view',
  ADMIN_USERS_VIEW: 'admin.users.view',
  ADMIN_USERS_MANAGE: 'admin.users.manage',
  ADMIN_USERS_IMPERSONATE: 'admin.users.impersonate',
  ADMIN_STORES_VIEW: 'admin.stores.view',
  ADMIN_STORES_MANAGE: 'admin.stores.manage',
  ADMIN_PRODUCTS_MODERATE: 'admin.products.moderate',
  ADMIN_CATALOG_MANAGE: 'admin.catalog.manage',
  ADMIN_ORDERS_VIEW: 'admin.orders.view',
  ADMIN_ORDERS_MANAGE: 'admin.orders.manage',
  ADMIN_DISPUTES_MANAGE: 'admin.disputes.manage',
  ADMIN_MARKETING_MANAGE: 'admin.marketing.manage',
  ADMIN_CMS_MANAGE: 'admin.cms.manage',
  ADMIN_FINANCE_VIEW: 'admin.finance.view',
  ADMIN_FINANCE_MANAGE: 'admin.finance.manage',
  ADMIN_REVIEWS_MODERATE: 'admin.reviews.moderate',
  ADMIN_SUPPORT_MANAGE: 'admin.support.manage',
  ADMIN_SETTINGS_MANAGE: 'admin.settings.manage',
  ADMIN_STAFF_MANAGE: 'admin.staff.manage',
  ADMIN_AUDIT_VIEW: 'admin.audit.view',
  ADMIN_SYSTEM_VIEW: 'admin.system.view',
  // ---- store (seller center) ----
  STORE_DASHBOARD: 'store.dashboard.view',
  STORE_SETTINGS_MANAGE: 'store.settings.manage',
  STORE_PRODUCTS_VIEW: 'store.products.view',
  STORE_PRODUCTS_MANAGE: 'store.products.manage',
  STORE_INVENTORY_MANAGE: 'store.inventory.manage',
  STORE_ORDERS_VIEW: 'store.orders.view',
  STORE_ORDERS_MANAGE: 'store.orders.manage',
  STORE_MARKETING_MANAGE: 'store.marketing.manage',
  STORE_FINANCE_VIEW: 'store.finance.view',
  STORE_FINANCE_MANAGE: 'store.finance.manage',
  STORE_ANALYTICS_VIEW: 'store.analytics.view',
  STORE_STAFF_MANAGE: 'store.staff.manage',
  STORE_CHAT_MANAGE: 'store.chat.manage',
  STORE_POS_USE: 'store.pos.use',
  STORE_DELIVERY_PERFORM: 'store.delivery.perform',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export const ALL_PERMISSIONS = Object.values(PERMISSIONS) as Permission[];
export const ADMIN_PERMISSIONS = ALL_PERMISSIONS.filter((p) => p.startsWith('admin.'));
export const STORE_PERMISSIONS = ALL_PERMISSIONS.filter((p) => p.startsWith('store.'));

const P = PERMISSIONS;

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, Permission[]> = {
  SUPER_ADMIN: ADMIN_PERMISSIONS,
  ADMIN: ADMIN_PERMISSIONS.filter((p) => p !== P.ADMIN_STAFF_MANAGE && p !== P.ADMIN_FINANCE_MANAGE),
  SUPPORT: [P.ADMIN_DASHBOARD, P.ADMIN_USERS_VIEW, P.ADMIN_ORDERS_VIEW, P.ADMIN_SUPPORT_MANAGE, P.ADMIN_DISPUTES_MANAGE, P.ADMIN_STORES_VIEW],
  MODERATOR: [P.ADMIN_DASHBOARD, P.ADMIN_PRODUCTS_MODERATE, P.ADMIN_REVIEWS_MODERATE, P.ADMIN_STORES_VIEW, P.ADMIN_USERS_VIEW],
  FINANCE: [P.ADMIN_DASHBOARD, P.ADMIN_FINANCE_VIEW, P.ADMIN_FINANCE_MANAGE, P.ADMIN_ORDERS_VIEW, P.ADMIN_STORES_VIEW],
};

export const STORE_ROLE_PERMISSIONS: Record<StoreRole, Permission[]> = {
  OWNER: STORE_PERMISSIONS,
  MANAGER: STORE_PERMISSIONS.filter((p) => p !== P.STORE_STAFF_MANAGE && p !== P.STORE_FINANCE_MANAGE),
  INVENTORY: [P.STORE_DASHBOARD, P.STORE_PRODUCTS_VIEW, P.STORE_PRODUCTS_MANAGE, P.STORE_INVENTORY_MANAGE],
  ORDERS: [P.STORE_DASHBOARD, P.STORE_ORDERS_VIEW, P.STORE_ORDERS_MANAGE, P.STORE_CHAT_MANAGE],
  MARKETING: [P.STORE_DASHBOARD, P.STORE_PRODUCTS_VIEW, P.STORE_MARKETING_MANAGE, P.STORE_ANALYTICS_VIEW],
  CASHIER: [P.STORE_POS_USE, P.STORE_PRODUCTS_VIEW],
  RIDER: [P.STORE_DELIVERY_PERFORM],
};

export function hasPermission(granted: readonly string[] | undefined, required: Permission): boolean {
  return !!granted && granted.includes(required);
}
