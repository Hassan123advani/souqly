import { assertStaffLimit } from '../plans/plan.service';
import { STORE_ROLE_PERMISSIONS } from '@souqly/shared';
import type { ActivityEntry, CustomRoleDTO, StaffInviteInput, StaffMemberDTO, StaffUpdateInput, StoreInvitationDTO, StoreRole } from '@souqly/shared';
import type { Request } from 'express';
import { Types } from 'mongoose';
import { env } from '../../config/env';
import { AppError, notFound } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { getEmail } from '../../services/email';
import { audit } from '../audit/audit.service';
import { AuditLog } from '../audit/auditLog.model';
import { escapeHtml } from '../onboarding/onboarding.service';
import { Store } from '../stores/store.model';
import { StoreMember } from '../stores/storeMember.model';
import { User } from '../users/user.model';
import { CustomRole } from './customRole.model';

const oid = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));

// ---------------------------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------------------------

export async function listStaff(storeId: Types.ObjectId): Promise<StaffMemberDTO[]> {
  const members = await StoreMember.find({ storeId }).sort({ createdAt: 1 }).lean();
  const [users, roles] = await Promise.all([
    User.find({ _id: { $in: members.map((m) => m.userId) } }).select('name email avatar').lean(),
    CustomRole.find({ storeId, _id: { $in: members.flatMap((m) => (m.customRoleId ? [m.customRoleId] : [])) } }).select('name').lean(),
  ]);
  const userById = new Map(users.map((u) => [String(u._id), u]));
  const roleById = new Map(roles.map((r) => [String(r._id), r]));
  return members.map((m) => {
    const u = userById.get(String(m.userId));
    const r = m.customRoleId ? roleById.get(String(m.customRoleId)) : undefined;
    const avatar = (u as { avatar?: { url?: string } | string } | undefined)?.avatar;
    const avatarUrl = typeof avatar === 'string' ? avatar : avatar?.url;
    return {
      id: String(m._id),
      user: { id: String(m.userId), name: u?.name ?? 'Unknown', ...(u?.email ? { email: u.email } : {}), ...(avatarUrl ? { avatar: avatarUrl } : {}) },
      role: m.role,
      ...(r ? { customRole: { id: String(r._id), name: r.name } } : {}),
      status: m.status,
      createdAt: m.createdAt.toISOString(),
    };
  });
}

/** Resolves the role to grant; the actor must hold every permission it carries (no escalation). */
async function resolveRole(req: Request, input: { role?: string; customRoleId?: string }): Promise<{ role: StoreRole; customRoleId?: Types.ObjectId }> {
  const storeId = req.store!._id;
  if (input.customRoleId) {
    const role = await CustomRole.findOne({ _id: oid(input.customRoleId), storeId }).select('permissions').lean();
    if (!role) throw notFound('Role');
    assertGrantable(req, role.permissions);
    return { role: 'CUSTOM', customRoleId: role._id };
  }
  const role = input.role as StoreRole;
  if (role === 'OWNER' || role === 'CUSTOM') throw new AppError(400, 'INVALID_ROLE', 'Choose a valid role');
  assertGrantable(req, STORE_ROLE_PERMISSIONS[role]);
  return { role };
}

export async function inviteStaff(req: Request, input: StaffInviteInput): Promise<{ status: 'invited' | 'email_sent'; member?: StaffMemberDTO }> {
  const store = req.store!;
  await assertStaffLimit(store); // Phase 10 plan limit
  const { role, customRoleId } = await resolveRole(req, input);
  const invitee = await User.findOne({ email: input.email }).select('_id name email').lean();
  const signupUrl = `${env.CLIENT_URL}/signup?email=${encodeURIComponent(input.email)}`;
  const invitationsUrl = `${env.CLIENT_URL}/seller/invitations`;

  if (!invitee) {
    // Unknown email: no member is created; the owner re-sends the invite once they have signed up (D-050).
    sendInviteEmail(input.email, store.name, signupUrl, true);
    await audit({ action: 'store.staff_invited', targetType: 'Store', targetId: store._id, meta: { role, existingUser: false }, req });
    return { status: 'email_sent' };
  }
  const existing = await StoreMember.findOne({ storeId: store._id, userId: invitee._id });
  if (existing) throw new AppError(409, 'ALREADY_MEMBER', existing.status === 'invited' ? 'This person is already invited' : 'This person is already on your team');

  const member = await StoreMember.create({
    storeId: store._id,
    userId: invitee._id,
    role,
    ...(customRoleId ? { customRoleId } : {}),
    status: 'invited',
    invitedBy: oid(req.user!.id),
  });
  sendInviteEmail(invitee.email!, store.name, invitationsUrl, false);
  await audit({ action: 'store.staff_invited', targetType: 'StoreMember', targetId: member._id, meta: { role, userId: String(invitee._id), existingUser: true }, req });
  const dto = (await listStaff(store._id)).find((m) => m.id === String(member._id));
  return { status: 'invited', ...(dto ? { member: dto } : {}) };
}

function sendInviteEmail(to: string, storeName: string, url: string, needsSignup: boolean): void {
  const action = needsSignup ? 'Create your Souqly account, then ask them to invite you again' : 'Open your invitations to accept';
  getEmail()
    .send({
      to,
      subject: `You're invited to join ${storeName} on Souqly`,
      text: `${storeName} invited you to help run their store on Souqly.\n${action}: ${url}`,
      html: `<p><strong>${escapeHtml(storeName)}</strong> invited you to help run their store on Souqly.</p><p><a href="${url}">${action}</a></p>`,
    })
    .catch((err) => logger.warn({ err }, 'staff invite email failed'));
}

/** Loads a member of THIS store; OWNER memberships can never be changed or removed here. */
async function loadEditableMember(storeId: Types.ObjectId, memberId: string) {
  const member = await StoreMember.findOne({ _id: oid(memberId), storeId });
  if (!member) throw notFound('Staff member');
  if (member.role === 'OWNER') throw new AppError(403, 'OWNER_PROTECTED', 'The store owner cannot be changed or removed');
  return member;
}

export async function updateStaff(req: Request, memberId: string, input: StaffUpdateInput): Promise<StaffMemberDTO> {
  const store = req.store!;
  const member = await loadEditableMember(store._id, memberId);
  if (String(member.userId) === req.user!.id) throw new AppError(403, 'FORBIDDEN', 'You cannot change your own access');
  const before = { role: member.role, status: member.status };
  if (input.role || input.customRoleId) {
    const { role, customRoleId } = await resolveRole(req, input);
    member.role = role;
    member.customRoleId = customRoleId;
    member.permissions = [];
  }
  if (input.status) {
    if (member.status === 'invited') throw new AppError(409, 'INVITE_PENDING', 'The invitation has not been accepted yet');
    member.status = input.status;
  }
  await member.save();
  await audit({ action: 'store.staff_updated', targetType: 'StoreMember', targetId: member._id, meta: { before, after: { role: member.role, status: member.status } }, req });
  return (await listStaff(store._id)).find((m) => m.id === String(member._id))!;
}

export async function removeStaff(req: Request, memberId: string): Promise<void> {
  const store = req.store!;
  const member = await loadEditableMember(store._id, memberId);
  await StoreMember.deleteOne({ _id: member._id, storeId: store._id });
  await audit({ action: 'store.staff_removed', targetType: 'StoreMember', targetId: member._id, meta: { userId: String(member.userId), role: member.role }, req });
}

// ---------------------------------------------------------------------------------------------
// Invitations (invitee side; no store context)
// ---------------------------------------------------------------------------------------------

export async function myInvitations(userId: string): Promise<StoreInvitationDTO[]> {
  const invites = await StoreMember.find({ userId: oid(userId), status: 'invited' }).sort({ createdAt: -1 }).lean();
  const [stores, roles] = await Promise.all([
    Store.find({ _id: { $in: invites.map((i) => i.storeId) } }).select('name slug logo').lean(),
    CustomRole.find({ _id: { $in: invites.flatMap((i) => (i.customRoleId ? [i.customRoleId] : [])) } }).select('name storeId').lean(),
  ]);
  const storeById = new Map(stores.map((s) => [String(s._id), s]));
  const roleById = new Map(roles.map((r) => [String(r._id), r]));
  return invites.flatMap((i) => {
    const s = storeById.get(String(i.storeId));
    if (!s) return [];
    const r = i.customRoleId ? roleById.get(String(i.customRoleId)) : undefined;
    return [
      {
        id: String(i._id),
        store: { id: String(s._id), name: s.name, slug: s.slug, ...(s.logo?.url ? { logo: s.logo.url } : {}) },
        role: i.role,
        ...(r && String(r.storeId) === String(i.storeId) ? { customRole: { id: String(r._id), name: r.name } } : {}),
        createdAt: i.createdAt.toISOString(),
      },
    ];
  });
}

/** Only the invited user can accept / decline their own invitation. */
export async function respondToInvitation(req: Request, inviteId: string, accept: boolean): Promise<void> {
  const filter = { _id: oid(inviteId), userId: oid(req.user!.id), status: 'invited' as const };
  const res = accept ? await StoreMember.findOneAndUpdate(filter, { $set: { status: 'active' } }) : await StoreMember.findOneAndDelete(filter);
  if (!res) throw notFound('Invitation');
  await audit({
    action: accept ? 'store.invitation_accepted' : 'store.invitation_declined',
    targetType: 'StoreMember',
    targetId: res._id,
    storeId: res.storeId,
    meta: { role: res.role },
    req,
  });
}

// ---------------------------------------------------------------------------------------------
// Custom roles
// ---------------------------------------------------------------------------------------------

/** A member can only grant permissions they hold themselves (no privilege escalation). */
function assertGrantable(req: Request, permissions: string[]): string[] {
  const own = new Set(req.storePermissions ?? []);
  const extra = permissions.filter((p) => !own.has(p));
  if (extra.length) throw new AppError(403, 'PERMISSION_NOT_GRANTABLE', 'You cannot grant permissions you do not have', { permissions: extra });
  return [...new Set(permissions)];
}

async function roleDTOs(storeId: Types.ObjectId, filter: Record<string, unknown> = {}): Promise<CustomRoleDTO[]> {
  const roles = await CustomRole.find({ storeId, ...filter }).sort({ name: 1 }).lean();
  const counts = await StoreMember.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $match: { storeId, customRoleId: { $in: roles.map((r) => r._id) } } },
    { $group: { _id: '$customRoleId', n: { $sum: 1 } } },
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.n]));
  return roles.map((r) => ({ id: String(r._id), name: r.name, permissions: r.permissions, memberCount: byId.get(String(r._id)) ?? 0 }));
}

export const listRoles = (storeId: Types.ObjectId) => roleDTOs(storeId);

const dupName = (err: unknown) => {
  if ((err as { code?: number }).code === 11000) return new AppError(409, 'ROLE_EXISTS', 'A role with this name already exists');
  return err;
};

export async function createRole(req: Request, input: { name: string; permissions: string[] }): Promise<CustomRoleDTO> {
  const storeId = req.store!._id;
  if ((await CustomRole.countDocuments({ storeId })) >= 30) throw new AppError(409, 'ROLE_LIMIT', 'A store can have at most 30 custom roles');
  const permissions = assertGrantable(req, input.permissions);
  const role = await CustomRole.create({ storeId, name: input.name, permissions }).catch((e) => {
    throw dupName(e);
  });
  await audit({ action: 'store.role_created', targetType: 'CustomRole', targetId: role._id, meta: { name: role.name, permissions }, req });
  return (await roleDTOs(storeId, { _id: role._id }))[0]!;
}

export async function updateRole(req: Request, id: string, input: { name?: string; permissions?: string[] }): Promise<CustomRoleDTO> {
  const storeId = req.store!._id;
  const set: Record<string, unknown> = {};
  if (input.name) set.name = input.name;
  if (input.permissions) set.permissions = assertGrantable(req, input.permissions);
  const role = await CustomRole.findOneAndUpdate({ _id: oid(id), storeId }, { $set: set }, { new: true }).catch((e) => {
    throw dupName(e);
  });
  if (!role) throw notFound('Role');
  await audit({ action: 'store.role_updated', targetType: 'CustomRole', targetId: role._id, meta: set, req });
  return (await roleDTOs(storeId, { _id: role._id }))[0]!;
}

export async function deleteRole(req: Request, id: string): Promise<void> {
  const storeId = req.store!._id;
  const role = await CustomRole.findOne({ _id: oid(id), storeId });
  if (!role) throw notFound('Role');
  if (await StoreMember.exists({ storeId, customRoleId: role._id })) throw new AppError(409, 'ROLE_IN_USE', 'Move staff off this role before deleting it');
  await role.deleteOne();
  await audit({ action: 'store.role_deleted', targetType: 'CustomRole', targetId: role._id, meta: { name: role.name }, req });
}

// ---------------------------------------------------------------------------------------------
// Activity log (store-scoped audit)
// ---------------------------------------------------------------------------------------------

export async function storeActivity(storeId: Types.ObjectId, q: { cursor?: string; limit: number }): Promise<{ items: ActivityEntry[]; nextCursor: string | null }> {
  const filter: Record<string, unknown> = { storeId };
  if (q.cursor) {
    if (!Types.ObjectId.isValid(q.cursor)) throw new AppError(400, 'INVALID_CURSOR', 'Invalid cursor');
    filter._id = { $lt: oid(q.cursor) };
  }
  const rows = await AuditLog.find(filter).sort({ _id: -1 }).limit(q.limit + 1).lean();
  const page = rows.slice(0, q.limit);
  const users = await User.find({ _id: { $in: page.flatMap((r) => (r.actorId ? [r.actorId] : [])) } }).select('name').lean();
  const names = new Map(users.map((u) => [String(u._id), u.name]));
  return {
    items: page.map((r) => ({
      id: String(r._id),
      action: r.action,
      ...(r.actorId ? { actor: { id: String(r.actorId), name: names.get(String(r.actorId)) ?? 'Unknown' } } : {}),
      ...(r.targetType ? { targetType: r.targetType } : {}),
      ...(r.targetId ? { targetId: r.targetId } : {}),
      meta: r.meta ?? {},
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor: rows.length > q.limit ? String(page[page.length - 1]!._id) : null,
  };
}
