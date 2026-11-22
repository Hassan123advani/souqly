import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middleware/error';
import { rateLimits } from './middleware/rateLimit';
import { accountRouter } from './modules/account/account.routes';
import { authRouter } from './modules/auth/auth.routes';
import { configRouter } from './modules/config/config.routes';
import { UPLOADS_DIR } from './services/storage';

/** Builds the Express app. Does NOT listen (tests import it with supertest). */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

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
        req: (req: { id: unknown; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
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
  api.use(express.json({ limit: '1mb' }));
  api.use(express.urlencoded({ extended: false, limit: '1mb' }));
  api.use(cookieParser());
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use(rateLimits.general);

  api.use('/', configRouter); // /health, /config/public
  api.use('/auth', authRouter);
  api.use('/account', accountRouter);

  app.use('/api/v1', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export const app = createApp();
