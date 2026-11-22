import request from 'supertest';
import { app } from '../app';
import { authenticator } from '../modules/auth/auth.service';
import { consoleOutbox } from '../services/email';

export const api = (path: string) => `/api/v1${path}`;

/** Like the real client (axios), every request carries X-Requested-With (bodyless POSTs need it: L9). */
export function newAgent() {
  return request.agent(app).set('X-Requested-With', 'XMLHttpRequest');
}

/** A plain (cookie-less) supertest client that also sends X-Requested-With. */
export function xhr() {
  return newAgent();
}

let counter = 0;
export function uniqueEmail(prefix = 'user') {
  counter++;
  return `${prefix}${counter}.${Date.now()}@test.souqly.pk`;
}

export async function signupAgent(overrides: { name?: string; email?: string; password?: string } = {}) {
  const agent = newAgent();
  const body = { name: 'Test User', email: uniqueEmail(), password: 'Passw0rd!', ...overrides };
  const res = await agent.post(api('/auth/signup')).send(body);
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, user: res.body.data.user, email: body.email, password: body.password, res };
}

export async function loginAgent(email: string, password: string) {
  const agent = newAgent();
  const res = await agent.post(api('/auth/login')).send({ email, password });
  return { agent, res };
}

/** Returns the value of a cookie from a supertest response's Set-Cookie headers. */
export function getCookie(res: { headers: Record<string, unknown> }, name: string): string | undefined {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? [raw] : [];
  for (const c of list) {
    const [pair] = c.split(';');
    const idx = pair!.indexOf('=');
    if (pair!.slice(0, idx) === name) return pair!.slice(idx + 1);
  }
  return undefined;
}

/** Waits until a console email to `to` whose subject matches arrives (fire-and-forget senders). */
export async function waitForEmail(to: string, subject: RegExp, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const msg = [...consoleOutbox].reverse().find((m) => m.to === to && subject.test(m.subject));
    if (msg) return msg;
    if (Date.now() > deadline) throw new Error(`No email "${subject}" sent to ${to}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** Extracts the `token` query param from the last console email sent to `to`. */
export function lastEmailToken(to: string): string {
  const msg = [...consoleOutbox].reverse().find((m) => m.to === to);
  if (!msg) throw new Error(`No email sent to ${to}`);
  const m = msg.text.match(/token=([A-Za-z0-9_%-]+)/);
  if (!m) throw new Error('No token in email');
  return decodeURIComponent(m[1]!);
}

/** TOTP for `steps` time steps from now (the server accepts +-1 step, and each step only once). */
export const totpAt = (secret: string, steps = 0) => authenticator.clone({ epoch: Date.now() + steps * 30_000 }).generate(secret);
