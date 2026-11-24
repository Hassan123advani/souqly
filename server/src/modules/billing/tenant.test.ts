import { describe, expect, it } from 'vitest';
import { billingOrder, endPeriod, setStorePlan, staffAgent } from '../../test/billingFixtures';
import { withStore } from '../../test/growthFixtures';
import { api, makeSeller } from '../orders/orderTestFixtures';
import { StoreMember } from '../stores/storeMember.model';
import { runBillingSweep } from './billing.service';
import { Invoice } from './invoice.model';

describe('billing tenant isolation', () => {
  it('store B can never read or pay store A billing; storeId only comes from membership', async () => {
    const a = await makeSeller('Tenant Bill A');
    const b = await makeSeller('Tenant Bill B');
    await setStorePlan(a.store._id, 'pro');
    await billingOrder({ storeId: a.store._id, subtotal: 100_000, deliveredDaysAgo: 2 });
    await endPeriod(a.store._id);
    await runBillingSweep();
    const inv = (await Invoice.findOne({ storeId: a.store._id }).lean())!;

    expect((await b.agent.get(api(`/seller/billing/invoices/${inv._id}`))).status).toBe(404);
    expect((await b.agent.get(api(`/seller/billing/invoices/${inv._id}/pdf`))).status).toBe(404);
    expect((await b.agent.post(api(`/seller/billing/invoices/${inv._id}/pay`)).send({ method: 'manual', channel: 'bank', reference: 'STEAL-1' })).status).toBe(404);
    expect((await b.agent.get(api('/seller/billing/invoices'))).body.data).toEqual([]);
    expect((await b.agent.get(api('/seller/billing/commissions'))).body.data).toEqual([]);
    expect((await b.agent.get(api('/seller/billing/summary'))).body.data.totals.grossSales).toBe(0);
    // Selecting A's store via header without membership is refused; storeId in query/body is ignored / rejected.
    expect((await b.agent.get(api('/seller/billing/summary')).set(withStore(a.store._id))).status).toBe(403);
    expect((await b.agent.get(api(`/seller/billing/invoices?storeId=${a.store._id}`))).body.data).toEqual([]);
    expect((await b.agent.post(api('/seller/billing/change-plan')).send({ plan: 'pro', storeId: String(a.store._id) })).status).toBe(400);

    // A sees its own data.
    const own = await a.agent.get(api(`/seller/billing/invoices/${inv._id}`));
    expect(own.status).toBe(200);
    expect(own.body.data.total).toBe(65_000);
    const admin = await staffAgent('FINANCE');
    const rows = (await admin.agent.get(api(`/admin/billing/commissions?storeId=${a.store._id}`))).body.data;
    expect(rows[0]).toMatchObject({ storeId: String(a.store._id), storeName: 'Tenant Bill A', storeSlug: a.store.slug, amount: 15_000 });
    // Seller rows never carry store fields.
    expect((await a.agent.get(api('/seller/billing/commissions'))).body.data[0].storeName).toBeUndefined();
  });

  it('sellers and non-finance staff cannot use admin billing routes', async () => {
    const s = await makeSeller('Tenant Bill Admin');
    for (const path of ['/admin/billing/overview', '/admin/billing/invoices', '/admin/billing/payments', '/admin/billing/settings']) {
      expect((await s.agent.get(api(path))).status).toBe(403);
    }
    expect((await s.agent.post(api(`/admin/billing/stores/${s.store._id}/reactivate`)).send({ reason: 'let me in please' })).status).toBe(403);
    const support = await staffAgent('SUPPORT');
    expect((await support.agent.get(api('/admin/billing/overview'))).status).toBe(403);
    const admin = await staffAgent('ADMIN');
    expect((await admin.agent.get(api('/admin/billing/overview'))).status).toBe(200);
    expect((await admin.agent.put(api('/admin/billing/settings')).send({ graceDays: 3, manualAccounts: [] })).status).toBe(403);
    const finance = await staffAgent('FINANCE');
    const put = await finance.agent.put(api('/admin/billing/settings')).send({ graceDays: 3, manualAccounts: [{ channel: 'bank', title: 'Souqly HBL', accountName: 'Souqly Pvt Ltd', accountNumber: '1234567890' }] });
    expect(put.status).toBe(200);
    expect(put.body.data.graceDays).toBe(3);
    const opts = await s.agent.get(api('/seller/billing/payment-options'));
    expect(opts.body.data.manualAccounts[0]).toMatchObject({ title: 'Souqly HBL' });
    await finance.agent.put(api('/admin/billing/settings')).send({ graceDays: 7, manualAccounts: [] });
    const overview = await finance.agent.get(api('/admin/billing/overview'));
    expect(overview.body.data).toMatchObject({ commissionBps: 1500, subscribers: expect.any(Object) });
    const csv = await finance.agent.get(api('/admin/billing/report?format=csv'));
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('cod_commission_minor');
    const detail = await finance.agent.get(api(`/admin/billing/stores/${s.store._id}`));
    expect(detail.body.data.store.id).toBe(String(s.store._id));
    // A store member of another store is still only a seller there.
    expect(await StoreMember.countDocuments({ storeId: s.store._id })).toBe(1);
  });
});
