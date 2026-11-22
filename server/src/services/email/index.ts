import { integrations } from '../../config/env';
import { ConsoleEmailService } from './console';
import { SmtpEmailService } from './smtp';

export type EmailMessage = { to: string; subject: string; html: string; text: string };

export interface EmailService {
  readonly name: 'smtp' | 'console';
  send(msg: EmailMessage): Promise<void>;
}

let instance: EmailService | undefined;

export function getEmail(): EmailService {
  instance ??= integrations.hasSmtp ? new SmtpEmailService() : new ConsoleEmailService();
  return instance;
}

/** Test hook. */
export function setEmail(s: EmailService | undefined): void {
  instance = s;
}

export { consoleOutbox } from './console';
