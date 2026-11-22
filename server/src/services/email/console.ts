import { isTest } from '../../config/env';
import type { EmailMessage, EmailService } from './index';

/** Last emails "sent" by the console fallback (tests read tokens from here). */
export const consoleOutbox: EmailMessage[] = [];
const MAX_OUTBOX = 50;

/** Dev fallback: prints emails to the terminal in a box. */
export class ConsoleEmailService implements EmailService {
  readonly name = 'console' as const;

  async send(msg: EmailMessage): Promise<void> {
    consoleOutbox.push(msg);
    if (consoleOutbox.length > MAX_OUTBOX) consoleOutbox.shift();
    if (isTest) return;
    const width = 76;
    const line = '-'.repeat(width);
    const row = (s: string) => `| ${s.slice(0, width - 2).padEnd(width - 2)}|`;
    const body = msg.text
      .split('\n')
      .flatMap((l) => (l.length ? (l.match(new RegExp(`.{1,${width - 2}}`, 'g')) ?? ['']) : ['']))
      .map(row)
      .join('\n');
    console.log(
      `\n\x1b[36m+${line}+\n${row('EMAIL (console fallback - SMTP not configured)')}\n+${line}+\n` +
        `${row(`To:      ${msg.to}`)}\n${row(`Subject: ${msg.subject}`)}\n+${line}+\x1b[0m\n` +
        `${body}\n\x1b[36m+${line}+\x1b[0m\n`,
    );
  }
}
