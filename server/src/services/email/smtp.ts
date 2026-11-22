import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env';
import type { EmailMessage, EmailService } from './index';

export class SmtpEmailService implements EmailService {
  readonly name = 'smtp' as const;
  private readonly transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }

  async send(msg: EmailMessage): Promise<void> {
    await this.transporter.sendMail({ from: env.SMTP_FROM, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
  }
}
