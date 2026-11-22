import { PLATFORM_ROLE_PERMISSIONS, type MeStore, type MeUser } from '@souqly/shared';
import { Types } from 'mongoose';
import { randomCode } from '../../lib/crypto';
import { Store } from '../stores/store.model';
import { StoreMember } from '../stores/storeMember.model';
import { User, type IUser, type UserDoc } from './user.model';

export async function generateReferralCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = `SQ${randomCode(6)}`;
    if (!(await User.exists({ referralCode: code }))) return code;
  }
  throw new Error('Could not generate a unique referral code');
}

export async function loadUserStores(userId: Types.ObjectId | string): Promise<MeStore[]> {
  const members = await StoreMember.find({ userId: new Types.ObjectId(String(userId)), status: 'active' })
    .sort({ createdAt: 1 })
    .lean();
  if (!members.length) return [];
  const stores = await Store.find({ _id: { $in: members.map((m) => m.storeId) } })
    .select('name slug status logo')
    .lean();
  const byId = new Map(stores.map((s) => [String(s._id), s]));
  return members.flatMap((m) => {
    const s = byId.get(String(m.storeId));
    if (!s) return [];
    return [{ id: String(s._id), slug: s.slug, name: s.name, role: m.role, status: s.status, ...(s.logo?.url ? { logoUrl: s.logo.url } : {}) }];
  });
}

type UserLike = (UserDoc | (IUser & { _id: Types.ObjectId })) & { _id: Types.ObjectId };

/** Builds the MeUser DTO (docs/api-auth.md). Never includes secrets. */
export async function toMeUser(user: UserLike, opts: { impersonatorId?: string } = {}): Promise<MeUser> {
  const stores = await loadUserStores(user._id);
  const role = user.platformRole ?? undefined;
  const prefs = user.preferences;
  return {
    id: String(user._id),
    name: user.name,
    email: user.email ?? '',
    ...(user.phone ? { phone: user.phone } : {}),
    ...(user.pendingPhone ? { pendingPhone: user.pendingPhone } : {}),
    ...(user.avatar?.url ? { avatarUrl: user.avatar.url } : {}),
    emailVerified: !!user.emailVerified,
    phoneVerified: !!user.phoneVerified,
    activeMode: user.activeMode,
    isSeller: !!user.isSeller,
    ...(role ? { platformRole: role } : {}),
    permissions: role ? [...PLATFORM_ROLE_PERMISSIONS[role]] : [],
    stores,
    passwordChangeRecommended: !!user.passwordChangeRecommended,
    twoFactorEnabled: !!user.twoFactor?.enabled,
    preferences: {
      language: prefs.language,
      currency: prefs.currency,
      theme: prefs.theme,
      notifications: {
        email: !!prefs.notifications.email,
        sms: !!prefs.notifications.sms,
        push: !!prefs.notifications.push,
        marketing: !!prefs.notifications.marketing,
      },
      privacy: {
        showProfileInReviews: !!prefs.privacy.showProfileInReviews,
        personalizedRecommendations: !!prefs.privacy.personalizedRecommendations,
      },
    },
    referralCode: user.referralCode,
    coins: user.coins,
    walletBalance: user.walletBalance,
    ...(opts.impersonatorId ? { impersonatedBy: opts.impersonatorId } : {}),
    createdAt: user.createdAt.toISOString(),
  };
}
