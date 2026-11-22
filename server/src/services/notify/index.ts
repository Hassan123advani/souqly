import { integrations } from '../../config/env';
import { ConsoleNotificationProvider } from './console';
import { TwilioNotificationProvider } from './twilio';

export interface NotificationProvider {
  readonly name: 'twilio' | 'console';
  sendSms(to: string, text: string): Promise<void>;
  sendWhatsApp(to: string, text: string): Promise<void>;
}

let instance: NotificationProvider | undefined;

export function getNotifier(): NotificationProvider {
  instance ??= integrations.hasTwilio ? new TwilioNotificationProvider() : new ConsoleNotificationProvider();
  return instance;
}

/** Test hook. */
export function setNotifier(p: NotificationProvider | undefined): void {
  instance = p;
}

export { notifyOutbox } from './console';
