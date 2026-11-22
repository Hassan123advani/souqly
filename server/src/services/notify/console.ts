import { isTest } from '../../config/env';
import type { NotificationProvider } from './index';

export const notifyOutbox: { channel: 'sms' | 'whatsapp'; to: string; text: string }[] = [];

/** Dev fallback: prints SMS / WhatsApp messages to the terminal. */
export class ConsoleNotificationProvider implements NotificationProvider {
  readonly name = 'console' as const;

  private log(channel: 'sms' | 'whatsapp', to: string, text: string) {
    notifyOutbox.push({ channel, to, text });
    if (notifyOutbox.length > 50) notifyOutbox.shift();
    if (!isTest) console.log(`\x1b[35m[${channel.toUpperCase()} -> ${to}] ${text}\x1b[0m`);
  }

  async sendSms(to: string, text: string): Promise<void> {
    this.log('sms', to, text);
  }

  async sendWhatsApp(to: string, text: string): Promise<void> {
    this.log('whatsapp', to, text);
  }
}
