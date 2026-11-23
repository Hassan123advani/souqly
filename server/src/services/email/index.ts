import { integrations } from '../../config/env';
import { ConsoleEmailService } from './console';
import { withOverrides } from './overrides';
import { SmtpEmailService } from './smtp';

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Built-in template key + its variables (lets admins override subject/HTML; see overrides.ts). */
  template?: { key: string; vars: Record<string, string> };
};

export interface EmailService {
  readonly name: 'smtp' | 'console';
  send(msg: EmailMessage): Promise<void>;
}

let instance: EmailService | undefined;

export function getEmail(): EmailService {
  instance ??= integrations.hasSmtp ? new SmtpEmailService() : new ConsoleEmailService();
  return withOverrides(instance);
}

/** Test hook. */
export function setEmail(s: EmailService | undefined): void {
  instance = s;
}

export { consoleOutbox } from './console';
