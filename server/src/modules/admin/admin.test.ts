import type { PlatformRole } from '@souqly/shared';
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { csvCell, csvRow } from '../../lib/csv';
import { api, newAgent, signupAgent } from '../../test/helpers';
import { consoleOutbox, getEmail } from '../../services/email';
import { welcome } from '../../services/email/templates';
import { AuditLog } from '../audit/auditLog.model';
import { Category } from '../catalog/category.model';
import { Product } from '../catalog/product.model';
import { makeItem, makeSeller } from '../orders/orderTestFixtures';
import { Payout } from '../payouts/payout.model';
import { User } from '../users/user.model';

async function staff(role: PlatformRole) {
  const s = await signupAgent({ name: `${role} person` });
  await User.updateOne({ email: s.email }, { $set: { platformRole: role } });
  const user = await User.findOne({ email: s.email }).lean();
  return { agent: s.agent, user: user!, email: s.email };
}

describe('permission matrix', () => {
  it('MODERATOR moderates but cannot touch finance/staff; FINANCE cannot moderate; SUPPORT cannot impersonate', async () => {
    const [mod, fin, sup] = [await staff('MODERATOR'), await staff('FINANCE'), await staff('SUPPORT')];
    const buyer = await signupAgent();
    const target = String(buyer.user.id ?? buyer.user._id);

    expect((await mod.agent.get(api('/admin/products?status=pending_review'))).status).toBe(200);
    expect((await mod.agent.get(api('/admin/reviews'))).status).toBe(200);
    expect((await mod.agent.get(api('/admin/payouts'))).status).toBe(403);
    expect((await mod.agent.get(api('/admin/staff'))).status).toBe(403);
    expect((await mod.agent.post(api(`/admin/users/${target}/wallet-adjust`)).send({ amount: 100, reason: 'test reason' })).status).toBe(403);

    expect((await fin.agent.get(api('/admin/payouts'))).status).toBe(200);
    expect((await fin.agent.get(api('/admin/finance/report'))).status).toBe(200);
    expect((await fin.agent.get(api('/admin/products'))).status).toBe(403);
    expect((await fin.agent.get(api('/admin/reviews'))).status).toBe(403);

    expect((await sup.agent.get(api('/admin/tickets'))).status).toBe(200);
    expect((await sup.agent.post(api(`/admin/users/${target}/impersonate`)).send({ reason: 'customer asked for help' })).status).toBe(403);

    expect((await buyer.agent.get(api('/admin/dashboard'))).status).toBe(403);
    expect((await newAgent().get(api('/admin/dashboard'))).status).toBe(401);
    const dash = await mod.agent.get(api('/admin/dashboard'));
    expect(dash.status).toBe(200);
    expect(dash.body.data.pending).toHaveProperty('products');
  });
});

describe('impersonation', () => {
  it('is audited, blocked for staff targets, blocks security + admin endpoints, and stop returns to the admin', async () => {
    const admin = await staff('ADMIN');
    const other = await staff('SUPPORT');
    const buyer = await signupAgent({ name: 'Imp Target' });
    const buyerId = String((await User.findOne({ email: buyer.email }).lean())!._id);

    expect((await admin.agent.post(api(`/admin/users/${other.user._id}/impersonate`)).send({ reason: 'checking things' })).body.error.code).toBe('CANNOT_IMPERSONATE_STAFF');
    expect((await admin.agent.post(api(`/admin/users/${buyerId}/impersonate`)).send({})).status).toBe(400);

    const start = await admin.agent.post(api(`/admin/users/${buyerId}/impersonate`)).send({ reason: 'Order support ticket #12' });
    expect(start.status, JSON.stringify(start.body)).toBe(200);
    const me = await admin.agent.get(api('/auth/me'));
    expect(me.body.data.user.id).toBe(buyerId);
    const log = await AuditLog.findOne({ action: 'admin.impersonation_started', targetId: buyerId }).lean();
    expect(log!.meta).toMatchObject({ reason: 'Order support ticket #12' });

    const pw = await admin.agent.post(api('/account/change-password')).send({ currentPassword: 'Passw0rd!', newPassword: 'NewPassw0rd!!' });
    expect(pw.body.error.code).toBe('IMPERSONATION_FORBIDDEN');
    expect((await admin.agent.get(api('/admin/dashboard'))).status).toBe(403);

    const stop = await admin.agent.post(api('/admin/impersonation/stop'));
    expect(stop.status, JSON.stringify(stop.body)).toBe(200);
    expect((await admin.agent.get(api('/auth/me'))).body.data.user.id).toBe(String(admin.user._id));
    expect((await admin.agent.get(api('/admin/dashboard'))).status).toBe(200);
    expect(await AuditLog.countDocuments({ action: 'admin.impersonation_stopped', targetId: buyerId })).toBe(1);
    expect((await admin.agent.post(api('/admin/impersonation/stop'))).status).toBe(400);
  });
});

describe('maintenance mode', () => {
  it('returns 503 to non-staff except auth/config/health; staff pass', async () => {
    const sa = await staff('SUPER_ADMIN');
    const buyer = await signupAgent();
    const on = await sa.agent.put(api('/admin/settings/site')).send({ name: 'Souqly', maintenance: true, maintenanceMessage: 'Back soon' });
    expect(on.status, JSON.stringify(on.body)).toBe(200);
    try {
      const blocked = await buyer.agent.get(api('/cart'));
      expect(blocked.status).toBe(503);
      expect(blocked.body.error.code).toBe('MAINTENANCE');
      expect((await newAgent().get(api('/catalog/categories'))).status).toBe(503);
      expect((await newAgent().get(api('/config/public'))).body.data.site.maintenance).toBe(true);
      expect((await newAgent().get(api('/health'))).status).toBe(200);
      expect((await buyer.agent.get(api('/auth/me'))).status).toBe(200);
      expect((await sa.agent.get(api('/cart'))).status).toBe(200);
    } finally {
      await sa.agent.put(api('/admin/settings/site')).send({ name: 'Souqly', maintenance: false });
    }
    expect((await buyer.agent.get(api('/cart'))).status).toBe(200);
  });
});

describe('CSV export', () => {
  it('escapes formula injection and quotes', async () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-2')).toBe("'-2");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvRow(['x', 1, null])).toBe('x,1,\r\n');

    const sa = await staff('SUPER_ADMIN');
    await signupAgent({ name: '=HYPERLINK("http://evil")' });
    const res = await sa.agent.get(api('/admin/users?format=csv&q=HYPERLINK'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });
});

describe('catalog', () => {
  it('moving a category recomputes descendants’ ancestors and products’ categoryPath', async () => {
    const sa = await staff('SUPER_ADMIN');
    const mk = async (slug: string, parentId: string | null) => {
      const r = await sa.agent.post(api('/admin/categories')).send({ name: { en: slug }, slug, parentId });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      return r.body.data.id as string;
    };
    const a = await mk('mv-a', null);
    const b = await mk('mv-b', null);
    const c = await mk('mv-c', a);
    const d = await mk('mv-d', c);
    const seller = await makeSeller('Move Store');
    const item = await makeItem(seller.store._id, 10_000);
    await Product.updateOne({ _id: item.product._id }, { $set: { categoryId: new Types.ObjectId(d), categoryPath: [a, c, d].map((x) => new Types.ObjectId(x)) } });

    expect((await sa.agent.post(api(`/admin/categories/${a}/move`)).send({ parentId: d })).body.error.code).toBe('INVALID_MOVE');
    const mv = await sa.agent.post(api(`/admin/categories/${c}/move`)).send({ parentId: b });
    expect(mv.status).toBe(202);
    let path: string[] = [];
    for (let i = 0; i < 50; i++) {
      path = ((await Product.findById(item.product._id).lean())!.categoryPath ?? []).map(String);
      if (path[0] === b) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(path).toEqual([b, c, d]);
    expect((await Category.findById(d).lean())!.ancestors.map((x) => String(x._id))).toEqual([b, c]);
  });
});

describe('staff roles', () => {
  it('protects the last SUPER_ADMIN; only SUPER_ADMIN changes roles', async () => {
    await User.updateMany({ platformRole: 'SUPER_ADMIN' }, { $unset: { platformRole: 1 } });
    const sa = await staff('SUPER_ADMIN');
    const admin = await staff('ADMIN');
    const self = await sa.agent.patch(api(`/admin/users/${sa.user._id}/role`)).send({ platformRole: 'ADMIN' });
    expect(self.status).toBe(409);
    expect(self.body.error.code).toBe('LAST_SUPER_ADMIN');
    expect((await admin.agent.patch(api(`/admin/users/${sa.user._id}/role`)).send({ platformRole: null })).status).toBe(403);

    const sa2 = await staff('SUPER_ADMIN');
    expect((await sa.agent.patch(api(`/admin/users/${sa2.user._id}/role`)).send({ platformRole: null })).status).toBe(200);
    expect((await sa.agent.post(api('/admin/staff')).send({ email: sa2.email, platformRole: 'MODERATOR' })).status).toBe(201);
    expect((await User.findById(sa2.user._id).lean())!.platformRole).toBe('MODERATOR');
    expect((await sa.agent.delete(api(`/admin/staff/${sa.user._id}`))).status).toBe(400);
  });
});

describe('payouts, products, tickets, pages, email templates', () => {
  it('payout state machine', async () => {
    const fin = await staff('FINANCE');
    const seller = await makeSeller('Payout Store');
    const p = await Payout.create({ storeId: seller.store._id, amount: 50_000, method: { type: 'bank', accountMasked: '****1234' } });
    expect((await fin.agent.post(api(`/admin/payouts/${p._id}/mark-paid`)).send({ reference: 'REF1' })).status).toBe(409);
    expect((await fin.agent.post(api(`/admin/payouts/${p._id}/approve`))).status).toBe(200);
    const paid = await fin.agent.post(api(`/admin/payouts/${p._id}/mark-paid`)).send({ reference: 'IBFT-1' });
    expect(paid.body.data.status).toBe('paid');
    expect((await fin.agent.post(api(`/admin/payouts/${p._id}/reject`)).send({ notes: 'too late' })).status).toBe(409);
  });

  it('product moderation approve / reject', async () => {
    const mod = await staff('MODERATOR');
    const seller = await makeSeller('Mod Store');
    const a = await makeItem(seller.store._id, 10_000);
    await Product.updateOne({ _id: a.product._id }, { $set: { status: 'pending_review' }, $unset: { publishedAt: 1 } });
    expect((await mod.agent.post(api(`/admin/products/${a.productId}/reject`)).send({})).status).toBe(400);
    const ok = await mod.agent.post(api('/admin/products/bulk')).send({ ids: [a.productId], action: 'approve' });
    expect(ok.body.data.ok).toEqual([a.productId]);
    expect((await Product.findById(a.productId).lean())!.status).toBe('published');
    const hide = await mod.agent.post(api(`/admin/products/${a.productId}/hide`)).send({ note: 'Counterfeit listing' });
    expect(hide.body.data.status).toBe('rejected');
  });

  it('support tickets: buyer creates, staff replies anonymously', async () => {
    const sup = await staff('SUPPORT');
    const buyer = await signupAgent();
    const t = await buyer.agent.post(api('/support/tickets')).send({ subject: 'Parcel late', category: 'order', body: 'My parcel is late by a week' });
    expect(t.status, JSON.stringify(t.body)).toBe(201);
    const reply = await sup.agent.post(api(`/admin/tickets/${t.body.data.id}/reply`)).send({ body: 'We are checking with the seller.' });
    expect(reply.status).toBe(201);
    const mine = await buyer.agent.get(api(`/support/tickets/${t.body.data.id}`));
    expect(mine.body.data.status).toBe('pending');
    expect(mine.body.data.messages[1].author).toBe('Souqly Support');
    const other = await signupAgent();
    expect((await other.agent.get(api(`/support/tickets/${t.body.data.id}`))).status).toBe(404);
  });

  it('CMS pages are sanitized and only published pages are public', async () => {
    const sa = await staff('SUPER_ADMIN');
    const res = await sa.agent.post(api('/admin/pages')).send({ slug: 'returns-policy', title: { en: 'Returns' }, body: { en: '<p>OK</p><script>alert(1)</script>', ur: '', ar: '' }, published: false });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.body.en).not.toContain('<script');
    expect((await newAgent().get(api('/pages/returns-policy'))).status).toBe(404);
    await sa.agent.patch(api(`/admin/pages/${res.body.data.id}`)).send({ published: true });
    expect((await newAgent().get(api('/pages/returns-policy'))).body.data.title.en).toBe('Returns');
  });

  it('email template override is used by the email service', async () => {
    const sa = await staff('SUPER_ADMIN');
    const put = await sa.agent.put(api('/admin/email-templates/welcome')).send({ subject: 'Hello {{name}}!', html: '<p>Welcome {{name}}</p>' });
    expect(put.status).toBe(200);
    await getEmail().send({ to: 'tpl@test.souqly.pk', ...welcome('<Zara>') });
    const msg = [...consoleOutbox].reverse().find((m) => m.to === 'tpl@test.souqly.pk')!;
    expect(msg.subject).toBe('Hello <Zara>!');
    expect(msg.html).toContain('&lt;Zara&gt;');
    const preview = await sa.agent.post(api('/admin/email-templates/welcome/preview')).send({});
    expect(preview.body.data.subject).toBe('Hello Ayesha!');
    expect((await sa.agent.get(api('/admin/system/health'))).body.data.db.status).toBe('connected');
  });
});
