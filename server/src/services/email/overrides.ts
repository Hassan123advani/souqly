import mongoose from 'mongoose';
import { logger } from '../../lib/logger';
import { sanitizeRichText, stripHtml } from '../../lib/sanitize';
import { EmailTemplateOverride } from '../../modules/admin/emailTemplate.model';
import type { EmailMessage, EmailService } from './index';
import { layout } from './templates';

const TTL_MS = 30_000;
let cache: { at: number; map: Map<string, { subject: string; html: string }> } | undefined;

export function clearTemplateOverrideCache(): void {
  cache = undefined;
}

async function overrides(): Promise<Map<string, { subject: string; html: string }>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map;
  const rows = await EmailTemplateOverride.find().select('key subject html').lean();
  cache = { at: Date.now(), map: new Map(rows.map((r) => [r.key, { subject: r.subject, html: r.html }])) };
  return cache.map;
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c] ?? c);

/** Replaces `{{var}}` placeholders. HTML values are escaped; unknown placeholders become empty. */
export function fillTemplate(tpl: string, vars: Record<string, string>, html: boolean): string {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k: string) => {
    const v = vars[k] ?? '';
    return html ? esc(v) : v.replace(/[\r\n]+/g, ' ');
  });
}

/** Renders an admin override (subject + body HTML inside the branded layout). */
export function renderOverride(o: { subject: string; html: string }, vars: Record<string, string>): Omit<EmailMessage, 'to'> {
  const subject = fillTemplate(o.subject, vars, false).slice(0, 200);
  const body = sanitizeRichText(fillTemplate(o.html, vars, true));
  return { subject, html: layout({ title: subject, bodyHtml: body }), text: stripHtml(body) };
}

/** Wraps an EmailService so messages tagged with a built-in template use the admin override when one exists. */
export function withOverrides(inner: EmailService): EmailService {
  return {
    name: inner.name,
    async send(msg: EmailMessage) {
      if (msg.template && mongoose.connection.readyState === 1) {
        try {
          const o = (await overrides()).get(msg.template.key);
          if (o) return inner.send({ ...msg, ...renderOverride(o, msg.template.vars) });
        } catch (err) {
          logger.warn({ err, template: msg.template.key }, 'Email template override failed; using the built-in template');
        }
      }
      return inner.send(msg);
    },
  };
}
