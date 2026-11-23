import type { RequestHandler } from 'express';
import { ACCESS_COOKIE } from '../modules/auth/tokens';
import { getSiteSettings } from '../modules/settings/settings.service';
import { resolveAccessToken } from './auth';

/** Paths (relative to /api/v1) that stay reachable during maintenance so staff can log in and clients can show the notice. */
const OPEN_PREFIXES = ['/auth', '/config/public', '/health', '/pages'];

/**
 * Maintenance mode (`settings.site.maintenance`): everyone except platform staff gets
 * 503 MAINTENANCE on the API, apart from auth / config / health / CMS pages.
 */
export const maintenanceGate: RequestHandler = (req, res, next) => {
  if (OPEN_PREFIXES.some((p) => req.path === p || req.path.startsWith(`${p}/`))) return next();
  getSiteSettings()
    .then(async (site) => {
      if (!site.maintenance) return next();
      const token = (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];
      const user = token ? await resolveAccessToken(token) : undefined;
      if (user && !(user instanceof Error) && user.platformRole && !user.impersonatorId) return next();
      res.setHeader('Retry-After', '600');
      res.status(503).json({ error: { code: 'MAINTENANCE', message: site.maintenanceMessage ?? 'Souqly is down for maintenance. Please try again shortly.' } });
    })
    .catch(next);
};
