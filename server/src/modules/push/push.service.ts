import { Types } from 'mongoose';
import webpush from 'web-push';
import { env, integrations } from '../../config/env';
import { logger } from '../../lib/logger';
import { PushSubscription } from './push.model';

let configured = false;
function ensureConfigured(): boolean {
  if (!integrations.hasVapid) return false;
  if (!configured) {
    webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:support@souqly.pk', env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
    configured = true;
  }
  return true;
}

export type PushPayload = { title: string; body: string; link?: string; type?: string };

/** Sends a web push to every subscription of the user. No-op without VAPID keys. Never throws. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;
  const subs = await PushSubscription.find({ userId: new Types.ObjectId(userId) }).lean();
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), { TTL: 3600 });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404 / 410: the browser dropped the subscription.
        if (status === 404 || status === 410) await PushSubscription.deleteOne({ _id: s._id });
        else logger.warn({ status }, 'Web push failed');
      }
    }),
  );
}

export async function saveSubscription(userId: string, input: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent?: string) {
  // An endpoint belongs to one browser; re-subscribing from another account moves it.
  await PushSubscription.findOneAndUpdate(
    { endpoint: input.endpoint },
    { $set: { userId: new Types.ObjectId(userId), keys: input.keys, ...(userAgent ? { userAgent: userAgent.slice(0, 300) } : {}) } },
    { upsert: true },
  );
}

export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
  await PushSubscription.deleteOne({ endpoint, userId: new Types.ObjectId(userId) });
}
