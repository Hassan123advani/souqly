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

const trustProxy = () =>
  z.preprocess(
    (v) => {
      const b = blankToUndefined(v);
      if (b === undefined) return false;
      const s = String(b).trim();
      const lower = s.toLowerCase();
      if (['false', '0', 'no', 'off'].includes(lower)) return false;
      if (['true', 'yes', 'on'].includes(lower)) return true;
      if (/^\d+$/.test(s)) return Number(s);
      return s; // e.g. "loopback" or a comma-separated list of proxy IPs / CIDRs
    },
    z.union([z.boolean(), z.number().int().min(0), z.string()]),
  );

/** Passwords that must never protect the production Super Admin. */
const WEAK_ADMIN_PASSWORDS = new Set(['souqly123', 'souqly1234', 'password', 'password123', 'admin123', 'admin1234', 'demo1234', '12345678', '123456789012']);
export const DEFAULT_ADMIN_PASSWORD = 'souqly123';

/** True when the Super Admin password is the default, on a deny-list, or shorter than 12 characters. */
export function isWeakAdminPassword(password: string): boolean {
  const lower = password.toLowerCase();
  return password.length < 12 || WEAK_ADMIN_PASSWORDS.has(lower) || lower.includes(DEFAULT_ADMIN_PASSWORD);
}

/** True when every host of a mongodb:// URI is the local machine (mongodb+srv is always remote). */
export function isLocalMongoUri(uri: string): boolean {
  const m = /^mongodb:\/\/(?:[^@/]*@)?([^/?]+)/i.exec(uri.trim());
  if (!m) return false;
  return m[1]!.split(',').every((hostPort) => {
    const host = hostPort.startsWith('[') ? hostPort.slice(0, hostPort.indexOf(']') + 1) : hostPort.split(':')[0]!;
    return ['localhost', '::1', '[::1]'].includes(host.toLowerCase()) || /^127\.\d+\.\d+\.\d+$/.test(host);
  });
}

export const envSchema = z
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
    /** Express `trust proxy`: false (default), a hop count, or proxy IPs/CIDRs. Never `true` in production. */
    TRUST_PROXY: trustProxy(),
    /** Extra allowed browser origins (comma-separated), on top of CLIENT_URL. */
    CORS_EXTRA_ORIGINS: str(),
    /** Return OTP codes in API responses when no SMS provider is configured (local development only). */
    DEV_OTP_ECHO: z.preprocess((v) => bool().parse(v) ?? false, z.boolean()),
    ADMIN_EMAIL: strDefault('souqly@gmail.com'),
    ADMIN_PASSWORD: strDefault(DEFAULT_ADMIN_PASSWORD),
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
    /** Automated store/product review (modules/aiReview). Unset = every submission waits for a human admin. */
    ANTHROPIC_API_KEY: str(),
    AI_REVIEW_MODEL: str(),
    /** Set by the Vercel runtime (build + functions). Only used to default SERVERLESS. */
    VERCEL: str(),
    /**
     * Serverless runtime (Vercel function): no Socket.io, no in-process scheduler, read-only disk.
     * Defaults to true when VERCEL is set. Local `npm run dev` / `npm start` leave it off.
     */
    SERVERLESS: bool(),
    /** Bearer secret for /api/v1/internal/cron/:job (Vercel Cron sends it). Unset = endpoint 404s. */
    CRON_SECRET: str(),
    LOG_LEVEL: z.preprocess(blankToUndefined, z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional()),
  })
  .superRefine((e, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (e.CRON_SECRET && e.CRON_SECRET.length < 16) issue('CRON_SECRET', 'CRON_SECRET must be at least 16 characters');
    if ((e.SERVERLESS ?? !!e.VERCEL) && !e.MONGODB_URI) {
      // The in-memory MongoDB fallback cannot run inside a serverless function.
      issue('MONGODB_URI', 'MONGODB_URI is required when running serverless (Vercel)');
    }
    if (e.NODE_ENV !== 'production') {
      if (e.DEV_OTP_ECHO && e.MONGODB_URI && !isLocalMongoUri(e.MONGODB_URI)) {
        issue('DEV_OTP_ECHO', 'DEV_OTP_ECHO must not be enabled against a non-local MONGODB_URI (real users would get their OTPs echoed)');
      }
      return;
    }
    for (const key of ['MONGODB_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'DATA_ENCRYPTION_KEY'] as const) {
      if (!e[key]) issue(key, `${key} is required in production`);
    }
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'DATA_ENCRYPTION_KEY'] as const) {
      const v = e[key];
      if (v && v.length < 32) issue(key, `${key} must be at least 32 characters`);
    }
    if (isWeakAdminPassword(e.ADMIN_PASSWORD)) {
      issue('ADMIN_PASSWORD', 'ADMIN_PASSWORD must be set to a strong value (12+ characters, not the default) in production');
    }
    if (e.DEV_OTP_ECHO) issue('DEV_OTP_ECHO', 'DEV_OTP_ECHO must be off in production');
    if (e.TRUST_PROXY === true) issue('TRUST_PROXY', 'TRUST_PROXY=true trusts any X-Forwarded-For; use a hop count (e.g. 1) or proxy IPs');
    if ((e.SERVERLESS ?? !!e.VERCEL) && (e.TRUST_PROXY === undefined || e.TRUST_PROXY === false)) {
      // Behind Vercel's proxy every request would share the proxy's IP: per-IP limits would lock everyone out at once.
      issue('TRUST_PROXY', 'TRUST_PROXY must be set (hop count, e.g. 1 on Vercel) when running serverless in production');
    }
  });

export type ParsedEnv = z.infer<typeof envSchema>;

/** Validates a raw environment (exported for tests). */
export function parseEnv(raw: Record<string, string | undefined>) {
  return envSchema.safeParse(raw);
}

const parsed = parseEnv(process.env);
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
if (e.NODE_ENV === 'development' && e.MONGODB_URI && !isLocalMongoUri(e.MONGODB_URI)) {
  const line = '!'.repeat(78);
  console.error(
    `[31m${line}
[souqly] NODE_ENV=development is pointing at a NON-LOCAL MongoDB.
` +
      `  Development defaults (verbose logs, generated secrets, dev-only helpers) must never run against real data.
` +
      `  Set NODE_ENV=production for real deployments.
${line}[0m`,
  );
}
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
  /** Serverless function runtime (Vercel): realtime/scheduler/local disk are unavailable. */
  SERVERLESS: e.SERVERLESS ?? !!e.VERCEL,
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
  hasAnthropic: !!e.ANTHROPIC_API_KEY,
};
export type Integrations = typeof integrations;
