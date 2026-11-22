import crypto from 'node:crypto';
import { env } from '../config/env';

/** URL-safe random token (default 32 bytes of entropy). */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Numeric code with uniform distribution, e.g. OTPs. */
export function randomDigits(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) out += crypto.randomInt(0, 10).toString();
  return out;
}

/** Short uppercase code without ambiguous characters (referral codes). */
export function randomCode(length = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[crypto.randomInt(0, alphabet.length)];
  return out;
}

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** AES-256-GCM encryption for small secrets at rest. Output: iv.tag.ciphertext (base64url). */
export function encrypt(plain: string, key: Buffer = env.DATA_KEY): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ct].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(payload: string, key: Buffer = env.DATA_KEY): string {
  const [iv, tag, ct] = payload.split('.').map((p) => Buffer.from(p, 'base64url'));
  if (!iv || !tag || !ct) throw new Error('Malformed encrypted payload');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
