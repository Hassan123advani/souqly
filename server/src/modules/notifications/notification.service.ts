import type { NotificationDTO } from '@souqly/shared';
import { Types } from 'mongoose';
import { env } from '../../config/env';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { cursorFilter, cursorSort, paginate } from '../../lib/pagination';
import { getEmail } from '../../services/email';
import { layout } from '../../services/email/templates';
import { getNotifier } from '../../services/notify';
import { emitToUser } from '../../socket';
import { sendPushToUser } from '../push/push.service';
import { User } from '../users/user.model';
import { Notification, type NotificationLean } from './notification.model';

export { Notification } from './notification.model';

export type NotifyChannel = 'inapp' | 'email' | 'sms' | 'push';

export type NotifyInput = {
  userId: string | Types.ObjectId;
  /** Dotted event name, e.g. `order.shipped`, `review.reply`, `chat.message`. */
  type: string;
  title: string;
  body: string;
  /** In-app path (e.g. `/account/orders/SQ-...`). Only relative paths are kept. */
  link?: string;
  data?: Record<string, unknown>;
  /** Defaults to `['inapp', 'push']`. email / sms / push honour the user's notification preferences. */
  channels?: NotifyChannel[];
};

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c] ?? c);
const safeLink = (link?: string) => (link && link.startsWith('/') && !link.startsWith('//') ? link : undefined);

export function toNotificationDTO(n: NotificationLean): NotificationDTO {
  return {
    id: String(n._id),
    type: n.type,
    title: n.title,
    body: n.body,
    ...(n.link ? { link: n.link } : {}),
    ...(n.data ? { data: n.data } : {}),
    readAt: n.readAt ? new Date(n.readAt).toISOString() : null,
    createdAt: new Date(n.createdAt).toISOString(),
  };
}

/**
 * Notifies one user. Writes the in-app row + emits `notification:new` on `user:{id}`, then (best effort)
 * email / SMS / web push. Never throws: a failed channel is logged and skipped. Never put secrets
 * (OTPs, tokens) in title/body/data — they are stored and may travel over SMS / push.
 */
export async function notify(input: NotifyInput): Promise<NotificationDTO | null> {
  const channels = new Set<NotifyChannel>(input.channels ?? ['inapp', 'push']);
  const userId = String(input.userId);
  const link = safeLink(input.link);
  let dto: NotificationDTO | null = null;
  try {
    if (channels.has('inapp')) {
      const doc = await Notification.create({
        userId: new Types.ObjectId(userId),
        type: input.type,
        title: input.title.slice(0, 200),
        body: input.body.slice(0, 1000),
        ...(link ? { link } : {}),
        ...(input.data ? { data: input.data } : {}),
      });
      dto = toNotificationDTO(doc.toObject() as NotificationLean);
      emitToUser(userId, 'notification:new', dto);
    }
    if (!channels.has('email') && !channels.has('sms') && !channels.has('push')) return dto;
    const user = await User.findById(userId).select('name email phone preferences').lean();
    if (!user) return dto;
    const prefs = user.preferences?.notifications ?? { email: true, sms: true, push: true, marketing: false };
    if (channels.has('email') && prefs.email !== false && user.email) {
      const url = link ? `${env.CLIENT_URL}${link}` : undefined;
      await getEmail()
        .send({
          to: user.email,
          subject: input.title,
          html: layout({
            title: esc(input.title),
            bodyHtml: `<p style="font-size:15px;line-height:1.6;margin:0 0 12px">${esc(input.body)}</p>`,
            ...(url ? { cta: { label: 'Open Souqly', url } } : {}),
          }),
          text: `${input.title}\n\n${input.body}${url ? `\n\n${url}` : ''}`,
        })
        .catch((err) => logger.warn({ err, type: input.type }, 'Notification email failed'));
    }
    if (channels.has('sms') && prefs.sms !== false && user.phone) {
      await getNotifier()
        .sendSms(user.phone, `Souqly: ${input.title}. ${input.body}`.slice(0, 300))
        .catch((err) => logger.warn({ err, type: input.type }, 'Notification SMS failed'));
    }
    if (channels.has('push') && prefs.push !== false) {
      await sendPushToUser(userId, { title: input.title, body: input.body, type: input.type, ...(link ? { link } : {}) });
    }
  } catch (err) {
    logger.warn({ err, type: input.type }, 'notify() failed');
  }
  return dto;
}

/** Same message to several users (deduplicated). Never throws. */
export async function notifyMany(userIds: (string | Types.ObjectId)[], input: Omit<NotifyInput, 'userId'>): Promise<void> {
  const unique = [...new Set(userIds.map(String))];
  await Promise.all(unique.map((userId) => notify({ ...input, userId })));
}

// ---------- in-app inbox (always scoped to the caller) ----------

const oid = (id: string) => new Types.ObjectId(id);

export async function listNotifications(userId: string, q: { cursor?: string; limit: number; unread?: boolean }) {
  const filter: Record<string, unknown> = { userId: oid(userId), ...(q.unread ? { readAt: null } : {}), ...cursorFilter('createdAt', -1, q.cursor) };
  const rows = await Notification.find(filter).sort(cursorSort('createdAt', -1)).limit(q.limit + 1).lean<NotificationLean[]>();
  const { items, nextCursor } = paginate(rows, q.limit, 'createdAt');
  return { items: items.map(toNotificationDTO), nextCursor };
}

export async function unreadCount(userId: string): Promise<number> {
  return Notification.countDocuments({ userId: oid(userId), readAt: null });
}

export async function markRead(userId: string, id: string): Promise<NotificationDTO> {
  await Notification.updateOne({ _id: oid(id), userId: oid(userId), readAt: null }, { $set: { readAt: new Date() } });
  const n = await Notification.findOne({ _id: oid(id), userId: oid(userId) }).lean<NotificationLean>();
  if (!n) throw new AppError(404, 'NOT_FOUND', 'Notification not found');
  return toNotificationDTO(n);
}

export async function markAllRead(userId: string): Promise<number> {
  const r = await Notification.updateMany({ userId: oid(userId), readAt: null }, { $set: { readAt: new Date() } });
  return r.modifiedCount;
}

export async function deleteNotification(userId: string, id: string): Promise<void> {
  const r = await Notification.deleteOne({ _id: oid(id), userId: oid(userId) });
  if (r.deletedCount !== 1) throw new AppError(404, 'NOT_FOUND', 'Notification not found');
}
