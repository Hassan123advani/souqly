import type { CookieOptions, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

export const ACCESS_COOKIE = 'sq_at';
export const REFRESH_COOKIE = 'sq_rt';
export const ACCESS_TTL_SEC = 15 * 60;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export type AccessPayload = { sub: string; sid: string; imp?: string };

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TTL_SEC, algorithm: 'HS256' });
}

export type VerifyResult = { ok: true; payload: AccessPayload } | { ok: false; reason: 'expired' | 'invalid' };

export function verifyAccessToken(token: string): VerifyResult {
  try {
    const p = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    if (typeof p.sub !== 'string' || typeof p.sid !== 'string') return { ok: false, reason: 'invalid' };
    return { ok: true, payload: { sub: p.sub, sid: p.sid, imp: typeof p.imp === 'string' ? p.imp : undefined } };
  } catch (err) {
    return { ok: false, reason: err instanceof jwt.TokenExpiredError ? 'expired' : 'invalid' };
  }
}

function baseCookie(): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: env.COOKIE_SECURE };
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_COOKIE, accessToken, { ...baseCookie(), path: '/', maxAge: ACCESS_TTL_SEC * 1000 });
  res.cookie(REFRESH_COOKIE, refreshToken, { ...baseCookie(), path: REFRESH_COOKIE_PATH, maxAge: REFRESH_TTL_MS });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookie(), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...baseCookie(), path: REFRESH_COOKIE_PATH });
}

/** Minimal Cookie header parser (used by the socket handshake). */
export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k || k in out) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}
