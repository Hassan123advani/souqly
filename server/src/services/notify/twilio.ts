import { env } from '../../config/env';
import type { NotificationProvider } from './index';

/** Twilio Messages REST API via fetch (no SDK). */
export class TwilioNotificationProvider implements NotificationProvider {
  readonly name = 'twilio' as const;

  private async send(from: string | undefined, to: string, body: string): Promise<void> {
    if (!from) throw new Error('Twilio sender number is not configured for this channel');
    const sid = env.TWILIO_ACCOUNT_SID ?? '';
    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
    const auth = Buffer.from(`${sid}:${env.TWILIO_AUTH_TOKEN ?? ''}`).toString('base64');
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: from, To: to, Body: body }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Twilio request failed with status ${res.status}`);
  }

  sendSms(to: string, text: string): Promise<void> {
    return this.send(env.TWILIO_FROM_NUMBER, to, text);
  }

  sendWhatsApp(to: string, text: string): Promise<void> {
    const from = env.TWILIO_WHATSAPP_FROM;
    return this.send(from ? `whatsapp:${from.replace(/^whatsapp:/, '')}` : undefined, `whatsapp:${to}`, text);
  }
}
