import { Router } from 'express';
import { adminCmsRouter } from '../cms/cms.routes';
import { adminSupportRouter } from '../support/support.routes';
import { adminCatalogRouter } from './catalog.routes';
import { adminDashboardRouter } from './dashboard.routes';
import { adminDisputesRouter } from './disputes.routes';
import { adminEmailTemplatesRouter } from './emailTemplates.routes';
import { adminFinanceRouter } from './finance.routes';
import { adminMarketingRouter } from './marketing.routes';
import { adminModerationRouter } from './moderation.routes';
import { adminOrdersRouter } from './orders.routes';
import { adminPlatformRouter } from './platform.routes';
import { adminProductsRouter } from './products.routes';
import { adminSettingsRouter } from './settings.routes';
import { adminStoresAdminRouter } from './stores.routes';
import { adminUsersRouter } from './users.routes';

/**
 * Super Admin API (Phase 9), mounted at /api/v1/admin. Every route carries its own
 * requireAuth + requirePermission(ADMIN_*) (see `can()`); see docs/api-admin.md.
 */
export const adminRouter = Router();
for (const r of [
  adminDashboardRouter,
  adminUsersRouter,
  adminStoresAdminRouter,
  adminProductsRouter,
  adminCatalogRouter,
  adminOrdersRouter,
  adminDisputesRouter,
  adminMarketingRouter,
  adminCmsRouter,
  adminFinanceRouter,
  adminModerationRouter,
  adminSupportRouter,
  adminEmailTemplatesRouter,
  adminSettingsRouter,
  adminPlatformRouter,
]) {
  adminRouter.use(r);
}
