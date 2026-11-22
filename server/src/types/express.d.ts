import type { PlatformRole } from '@souqly/shared';
import type { StoreDoc } from '../modules/stores/store.model';
import type { StoreMemberDoc } from '../modules/stores/storeMember.model';

export type AuthUser = {
  id: string;
  platformRole?: PlatformRole;
  /** Platform permissions (admin.*). Store permissions live on req.storePermissions. */
  permissions: string[];
  sessionId: string;
  impersonatorId?: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      store?: StoreDoc;
      storeMember?: StoreMemberDoc;
      storePermissions?: string[];
    }
  }
}

export {};
