import { afterEach, describe, expect, it } from 'vitest';
import { env, parseEnv } from '../../config/env';
import { UnavailableStorage } from '../../services/storage';
import { api, newAgent } from '../../test/helpers';
import { Category } from '../catalog/category.model';
import { SWEEP_NAMES } from '../../services/jobs/sweeps';
import { isValidCronAuth } from './cron.service';

const SECRET = 'test-cron-secret-0123456789abcdef';
const original = env.CRON_SECRET;
afterEach(() => {
  env.CRON_SECRET = original;
});

describe('cron endpoint', () => {
  it('404s when CRON_SECRET is not configured', async () => {
    env.CRON_SECRET = undefined;
    const res = await newAgent().get(api('/internal/cron/all')).set('Authorization', `Bearer ${SECRET}`);
    expect(res.status).toBe(404);
  });

  it('rejects a missing or wrong bearer token (before validating the job name)', async () => {
    env.CRON_SECRET = SECRET;
    expect((await newAgent().get(api('/internal/cron/all'))).status).toBe(401);
    expect((await newAgent().get(api('/internal/cron/all')).set('Authorization', `Bearer ${SECRET}x`)).status).toBe(401);
    expect((await newAgent().get(api('/internal/cron/nope')).set('Authorization', 'Bearer wrong')).status).toBe(401);
    expect((await newAgent().get(api('/internal/cron/all')).set('Authorization', SECRET)).status).toBe(401);
  });

  it('validates the job name', async () => {
    env.CRON_SECRET = SECRET;
    const res = await newAgent().get(api('/internal/cron/nope')).set('Authorization', `Bearer ${SECRET}`);
    expect(res.status).toBe(400);
  });

  it('runs every job once for "all"', async () => {
    env.CRON_SECRET = SECRET;
    const root = await Category.create({ slug: `cron-root-${Date.now()}`, name: { en: 'Root', ur: '', ar: '' }, icon: 'box', order: 0, ancestors: [] });
    const rootAnc = { _id: root._id, slug: root.slug, name: { en: 'Root', ur: '', ar: '' } };
    const child = await Category.create({ slug: `cron-child-${Date.now()}`, name: { en: 'Child', ur: '', ar: '' }, icon: 'box', order: 0, parentId: root._id, ancestors: [rootAnc] });
    const grandchild = await Category.create({
      slug: `cron-grandchild-${Date.now()}`,
      name: { en: 'Grandchild', ur: '', ar: '' },
      icon: 'box',
      order: 0,
      parentId: child._id,
      ancestors: [rootAnc], // stale (missed recompute): the sweep must add the child
    });
    const res = await newAgent().get(api('/internal/cron/all')).set('Authorization', `Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(res.body.data.results.map((r: { job: string }) => r.job)).toEqual(SWEEP_NAMES);
    expect(res.body.data.results.every((r: { ok: boolean }) => r.ok)).toBe(true);
    const fixed = await Category.findById(grandchild._id).lean();
    expect(fixed!.ancestors.map((a) => String(a._id))).toEqual([String(root._id), String(child._id)]);
  });

  it('runs a single job (POST works too)', async () => {
    env.CRON_SECRET = SECRET;
    const res = await newAgent().post(api('/internal/cron/alerts.sweep')).set('Authorization', `Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(res.body.data.results).toHaveLength(1);
    expect(res.body.data.results[0]).toMatchObject({ job: 'alerts.sweep', ok: true, result: { sent: 0 } });
  });

  it('isValidCronAuth compares in constant time and needs the Bearer scheme', () => {
    expect(isValidCronAuth(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(isValidCronAuth(`Bearer ${SECRET.slice(0, -1)}`, SECRET)).toBe(false);
    expect(isValidCronAuth(`Basic ${SECRET}`, SECRET)).toBe(false);
    expect(isValidCronAuth(undefined, SECRET)).toBe(false);
  });
});

describe('serverless configuration', () => {
  it('reports realtime: true outside serverless', async () => {
    const res = await newAgent().get(api('/config/public'));
    expect(res.body.data.integrations.realtime).toBe(true);
  });

  it('SERVERLESS defaults from VERCEL and then requires MONGODB_URI', () => {
    const r = parseEnv({ NODE_ENV: 'test', VERCEL: '1' });
    expect(r.success).toBe(false);
    expect(r.error!.issues.some((i) => i.path[0] === 'MONGODB_URI')).toBe(true);
    expect(parseEnv({ NODE_ENV: 'test', VERCEL: '1', SERVERLESS: '0' }).success).toBe(true);
    expect(parseEnv({ NODE_ENV: 'test', VERCEL: '1', MONGODB_URI: 'mongodb+srv://u:p@cluster.example.net/souqly' }).success).toBe(true);
  });

  it('rejects a short CRON_SECRET', () => {
    expect(parseEnv({ NODE_ENV: 'test', CRON_SECRET: 'short' }).success).toBe(false);
  });

  it('serverless storage without Cloudinary refuses uploads with a clear AppError', async () => {
    const s = new UnavailableStorage();
    await expect(s.upload()).rejects.toMatchObject({ status: 503, code: 'STORAGE_NOT_CONFIGURED' });
    await expect(s.delete()).resolves.toBeUndefined();
  });
});
