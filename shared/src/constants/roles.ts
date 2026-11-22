/** Platform-level staff roles (Souqly team). */
export const PLATFORM_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'MODERATOR', 'FINANCE'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/** Built-in store-level roles. Store owners may also create custom roles. */
export const STORE_ROLES = ['OWNER', 'MANAGER', 'INVENTORY', 'ORDERS', 'MARKETING', 'CASHIER', 'RIDER'] as const;
export type StoreRole = (typeof STORE_ROLES)[number];

export const USER_MODES = ['buyer', 'seller'] as const;
export type UserMode = (typeof USER_MODES)[number];
