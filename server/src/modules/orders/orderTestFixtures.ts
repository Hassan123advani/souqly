/** Test-only helpers for Phase 6 API tests (imported by *.test.ts only). */
import type { StoreRole } from '@souqly/shared';
import { makeCategoryTree, makeProduct } from '../../test/catalogFixtures';
import { api, signupAgent } from '../../test/helpers';
import { Address } from '../account/address.model';
import { Store } from '../stores/store.model';
import { StoreMember } from '../stores/storeMember.model';
import { User } from '../users/user.model';

let n = 0;

export async function makeBuyer(city = 'Lahore') {
  const s = await signupAgent({ name: `Buyer ${++n}` });
  const user = await User.findOne({ email: s.email });
  const address = await Address.create({ userId: user!._id, fullName: `Buyer ${n}`, phone: '+923001234567', city, line1: 'House 1, Street 2', isDefault: true });
  return { agent: s.agent, user: user!, address, addressId: String(address._id), email: s.email };
}

export async function makeSeller(name: string, city = 'Lahore') {
  const s = await signupAgent({ name: `${name} Owner` });
  const owner = await User.findOne({ email: s.email });
  n++;
  const store = await Store.create({
    ownerId: owner!._id,
    name,
    slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${n}-${Date.now() % 100000}`,
    status: 'approved',
    address: { city },
    contact: { email: `store${n}.${Date.now()}@test.souqly.pk` },
  });
  await StoreMember.create({ storeId: store._id, userId: owner!._id, role: 'OWNER' });
  return { agent: s.agent, owner: owner!, store };
}

export async function addStaff(storeId: unknown, role: StoreRole) {
  const s = await signupAgent({ name: `${role} staff ${++n}` });
  const user = await User.findOne({ email: s.email });
  const member = await StoreMember.create({ storeId, userId: user!._id, role });
  return { agent: s.agent, user: user!, member };
}

let tree: Awaited<ReturnType<typeof makeCategoryTree>> | undefined;
export async function categories() {
  tree ??= await makeCategoryTree();
  return tree;
}

export async function makeItem(storeId: unknown, price: number, stock = 10, extra: Partial<Parameters<typeof makeProduct>[0]> = {}) {
  const { sub } = await categories();
  const p = await makeProduct({ storeId: storeId as never, category: sub, title: `Item ${++n}`, price, stock, ...extra });
  return { product: p, productId: String(p._id), variantId: String(p.variants[0]!._id) };
}

export const key = () => `key-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
export { api };
