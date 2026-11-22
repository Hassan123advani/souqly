import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

/** Absolute path of the `server/` folder (works from the repo root or from inside `server/`). */
const cwd = process.cwd();
export const SERVER_ROOT = fs.existsSync(path.join(cwd, 'server', 'package.json')) ? path.join(cwd, 'server') : cwd;

const rawNodeEnv = process.env.NODE_ENV ?? 'development';
// Tests never read server/.env so a developer's real SMTP/Twilio keys can't be used by the test suite.
if (rawNodeEnv !== 'test') {
  dotenv.config({ path: path.join(SERVER_ROOT, '.env') });
}

/** Treat empty strings (e.g. `SMTP_HOST=`) as "not set". */
const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const str = () => z.preprocess(blankToUndefined, z.string().trim().optional());
const strDefault = (d: string) => z.preprocess(blankToUndefined, z.string().trim().default(d));
const int = (d: number) => z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(d));
const bool = () =>
  z.preprocess(
    (v) => {
      const b = blankToUndefined(v);
      if (b === undefined) return undefined;
      return ['1', 'true', 'yes', 'on'].includes(String(b).toLowerCase());
    },
    z.boolean().optional(),
  );

const schema = z
  .object({
    NODE_ENV: z.preprocess(blankToUndefined, z.enum(['development', 'test', 'production']).default('development')),
    PORT: int(4000),
    CLIENT_URL: strDefault('http://localhost:5173'),
    SERVER_URL: str(),
    MONGODB_URI: str(),
    JWT_ACCESS_SECRET: str(),
    JWT_REFRESH_SECRET: str(),
    DATA_ENCRYPTION_KEY: str(),
    COOKIE_SECURE: bool(),
    ADMIN_EMAIL: strDefault('souqly@gmail.com'),
    ADMIN_PASSWORD: strDefault('souqly123'),
    ADMIN_NAME: strDefault('Souqly Admin'),
    CLOUDINARY_CLOUD_NAME: str(),
    CLOUDINARY_API_KEY: str(),
    CLOUDINARY_API_SECRET: str(),
    SMTP_HOST: str(),
    SMTP_PORT: int(587),
    SMTP_USER: str(),
    SMTP_PASS: str(),
    SMTP_FROM: strDefault('Souqly <no-reply@souqly.pk>'),
    TWILIO_ACCOUNT_SID: str(),
    TWILIO_AUTH_TOKEN: str(),
    TWILIO_FROM_NUMBER: str(),
    TWILIO_WHATSAPP_FROM: str(),
    GOOGLE_CLIENT_ID: str(),
    GOOGLE_CLIENT_SECRET: str(),
    REDIS_URL: str(),
    STRIPE_SECRET_KEY: str(),
    STRIPE_WEBHOOK_SECRET: str(),
    JAZZCASH_MERCHANT_ID: str(),
    JAZZCASH_PASSWORD: str(),
    JAZZCASH_INTEGRITY_SALT: str(),
    EASYPAISA_STORE_ID: str(),
    EASYPAISA_HASH_KEY: str(),
    VAPID_PUBLIC_KEY: str(),
    VAPID_PRIVATE_KEY: str(),
    VAPID_SUBJECT: str(),
    OPENAI_API_KEY: str(),
    LOG_LEVEL: z.preprocess(blankToUndefined, z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional()),
  })
  .superRefine((e, ctx) => {
    if (e.NODE_ENV !== 'production') return;
    for (const key of ['MONGODB_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      if (!e[key]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} is required in production` });
    }
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      const v = e[key];
      if (v && v.length < 32) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} must be at least 32 characters` });
    }
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // Logger depends on env, so plain console here.
  console.error(`\n[souqly] Invalid environment configuration:\n${lines}\n`);
  throw new Error('Invalid environment configuration');
}
const e = parsed.data;

const generatedSecrets: string[] = [];
function secretOrRandom(name: string, value: string | undefined): string {
  if (value) return value;
  generatedSecrets.push(name);
  return crypto.randomBytes(48).toString('base64url');
}

const JWT_ACCESS_SECRET = secretOrRandom('JWT_ACCESS_SECRET', e.JWT_ACCESS_SECRET);
const JWT_REFRESH_SECRET = secretOrRandom('JWT_REFRESH_SECRET', e.JWT_REFRESH_SECRET);
if (generatedSecrets.length && e.NODE_ENV === 'development') {
  console.warn(
    `\x1b[33m[souqly] WARNING: ${generatedSecrets.join(', ')} not set — generated random secrets for this boot. ` +
      `Everyone is logged out on every restart. Set them in server/.env to keep sessions.\x1b[0m`,
  );
}

export const env = {
  ...e,
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
  SERVER_URL: e.SERVER_URL ?? `http://localhost:${e.PORT}`,
  /** 32-byte key for AES-256-GCM encryption of data at rest (2FA secrets). */
  DATA_KEY: crypto
    .createHash('sha256')
    .update(e.DATA_ENCRYPTION_KEY ?? `souqly-data:${JWT_REFRESH_SECRET}`)
    .digest(),
  COOKIE_SECURE: e.COOKIE_SECURE ?? e.NODE_ENV === 'production',
};

export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const isDev = env.NODE_ENV === 'development';

/** Which optional third-party integrations are configured. Every one has a dev fallback. */
export const integrations = {
  hasMongo: !!e.MONGODB_URI,
  hasCloudinary: !!(e.CLOUDINARY_CLOUD_NAME && e.CLOUDINARY_API_KEY && e.CLOUDINARY_API_SECRET),
  hasSmtp: !!e.SMTP_HOST,
  hasTwilio: !!(e.TWILIO_ACCOUNT_SID && e.TWILIO_AUTH_TOKEN && (e.TWILIO_FROM_NUMBER || e.TWILIO_WHATSAPP_FROM)),
  hasGoogleAuth: !!(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET),
  hasRedis: !!e.REDIS_URL,
  hasStripe: !!e.STRIPE_SECRET_KEY,
  hasJazzCash: !!(e.JAZZCASH_MERCHANT_ID && e.JAZZCASH_PASSWORD && e.JAZZCASH_INTEGRITY_SALT),
  hasEasyPaisa: !!(e.EASYPAISA_STORE_ID && e.EASYPAISA_HASH_KEY),
  hasVapid: !!(e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY),
  hasOpenAI: !!e.OPENAI_API_KEY,
};
export type Integrations = typeof integrations;
