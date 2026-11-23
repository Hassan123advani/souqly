import { logger } from '../../lib/logger';
import { notify, type NotifyInput } from '../notifications/notification.service';

export type { NotifyInput };

/** Test hook: every Phase-8 notification is also captured here under NODE_ENV=test. */
export const notifyCapture: NotifyInput[] = [];

/** Phase-8 wrapper over the Phase-7 `notify()`: never throws (social actions must not fail on notifications). */
export async function notifySafe(input: NotifyInput): Promise<void> {
  if (process.env.NODE_ENV === 'test') notifyCapture.push(input);
  try {
    await notify(input);
  } catch (err) {
    logger.warn({ err, type: input.type }, 'Notification failed');
  }
}
