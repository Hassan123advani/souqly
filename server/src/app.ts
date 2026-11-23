import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './lib/logger';
import { requireJsonContentType } from './middleware/contentType';
import { errorHandler, notFoundHandler } from './middleware/error';
import { rateLimits } from './middleware/rateLimit';
import { accountRouter } from './modules/account/account.routes';
import { authRouter } from './modules/auth/auth.routes';
import { cartRouter } from './modules/cart/cart.routes';
import { marketplaceRouter } from './modules/catalog/catalog.routes';
import { checkoutRouter } from './modules/checkout/checkout.routes';
import { configRouter } from './modules/config/config.routes';
import { ordersRouter } from './modules/orders/orders.routes';
import { sellerOrdersRouter } from './modules/orders/sellerOrders.routes';
import { sellerRouter } from './modules/seller/seller.routes';
import { sellerPreStoreRouter } from './modules/onboarding/onboarding.routes';
import { tempUploadsRouter } from './modules/onboarding/tempUpload.routes';
import { adminStoresRouter } from './modules/stores/adminStores.routes';
import { storesPublicRouter } from './modules/stores/stores.routes';
import { UPLOADS_DIR } from './services/storage';

/** Paths whose query strings carry secrets (OAuth code/state) and are never logged. */
const SECRET_QUERY_PATHS = ['/api/v1/auth/google/callback'];

/** Request URL as logged: the query string is stripped on OAuth callback paths. */
export function loggableUrl(url: string): string {
  const q = url.indexOf('?');
  if (q < 0) return url;
  const path = url.slice(0, q);
  return SECRET_QUERY_PATHS.some((p) => path === p || path.startsWith(`${p}/`)) ? `${path}?[REDACTED]` : url;
}

/** Builds the Express app. Does NOT listen (tests import it with supertest). */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Off by default: only trust X-Forwarded-For when a known proxy sits in front (TRUST_PROXY).
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(
    helmet({
      contentSecurityPolicy: false, // JSON API; the client sets its own CSP
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(compression());
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
      serializers: {
        req: (req: { id: unknown; method: string; url: string }) => ({ id: req.id, method: req.method, url: loggableUrl(req.url) }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  // User uploads (local storage fallback). Long cache; never sniffed or executed as HTML/script.
  app.use(
    '/uploads',
    express.static(UPLOADS_DIR, {
      maxAge: '365d',
      immutable: true,
      index: false,
      dotfiles: 'ignore',
      fallthrough: true,
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      },
    }),
  );

  app.get('/robots.txt', (_req, res) => {
    // Placeholder; the SEO phase generates this (with sitemap) from settings.
    res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /account\nDisallow: /seller\nDisallow: /admin\n`);
  });

  const api = Router();
  api.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'x-store-id', 'x-requested-with'],
      maxAge: 600,
    }),
  );
  // JSON only (no urlencoded parser): see requireJsonContentType for the CSRF rationale.
  api.use(requireJsonContentType);
  api.use(express.json({ limit: '1mb' }));
  api.use(cookieParser());
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use(rateLimits.general);

  api.use('/', configRouter); // /health, /config/public
  api.use('/auth', authRouter);
  api.use('/account', accountRouter);
  api.use('/cart', cartRouter);
  api.use('/checkout', checkoutRouter);
  api.use('/orders', ordersRouter);
  api.use('/seller/orders', sellerOrdersRouter);
  api.use('/uploads', tempUploadsRouter); // POST /uploads/temp
  api.use('/admin', adminStoresRouter);
  api.use('/seller', sellerPreStoreRouter); // onboarding, invitations, rejected-store routes (before storeContext)
  api.use('/seller', sellerRouter);
  api.use('/stores', storesPublicRouter); // /stores/slug-available (before marketplace /stores/:slug)
  api.use('/', marketplaceRouter);

  app.use('/api/v1', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export const app = createApp();
