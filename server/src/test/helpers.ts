import request from 'supertest';
import { app } from '../app';
import { consoleOutbox } from '../services/email';

export const api = (path: string) => `/api/v1${path}`;

export function newAgent() {
  return request.agent(app);
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

/** Extracts the `token` query param from the last console email sent to `to`. */
export function lastEmailToken(to: string): string {
  const msg = [...consoleOutbox].reverse().find((m) => m.to === to);
  if (!msg) throw new Error(`No email sent to ${to}`);
  const m = msg.text.match(/token=([A-Za-z0-9_%-]+)/);
  if (!m) throw new Error('No token in email');
  return decodeURIComponent(m[1]!);
}
