import { env } from '../../config/env';
import type { EmailMessage } from './index';

type Rendered = Omit<EmailMessage, 'to'>;

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);

/** Shared branded layout: Souqly teal header, parchment background, saffron CTA. */
export function layout(opts: { title: string; bodyHtml: string; cta?: { label: string; url: string }; footerNote?: string }): string {
  const cta = opts.cta
    ? `<tr><td style="padding:8px 32px 24px"><a href="${esc(opts.cta.url)}" style="display:inline-block;background:#F2A93B;color:#1b1b1b;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:10px">${esc(opts.cta.label)}</a>
       <p style="font-size:12px;color:#6b6259;margin:16px 0 0">If the button does not work, copy this link:<br><span style="word-break:break-all">${esc(opts.cta.url)}</span></p></td></tr>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.title)}</title></head>
<body style="margin:0;background:#FBF8F3;font-family:'Plus Jakarta Sans',Segoe UI,Arial,sans-serif;color:#2a2622">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FBF8F3;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.06)">
<tr><td style="background:#0E5E5A;padding:20px 32px;color:#ffffff"><span style="font-size:22px;font-weight:800;letter-spacing:.3px">Souqly</span><span style="color:#F2A93B;font-size:13px;margin-left:8px">Every shop, one souq.</span></td></tr>
<tr><td style="padding:28px 32px 8px"><h1 style="font-size:20px;margin:0 0 12px;color:#0E5E5A">${esc(opts.title)}</h1>${opts.bodyHtml}</td></tr>
${cta}
<tr><td style="padding:16px 32px 24px;border-top:1px solid #efe9df;font-size:12px;color:#8a8178">${opts.footerNote ? `${esc(opts.footerNote)}<br>` : ''}&copy; ${new Date().getFullYear()} Souqly. You are receiving this because of activity on your Souqly account.</td></tr>
</table></td></tr></table></body></html>`;
}

const p = (s: string) => `<p style="font-size:15px;line-height:1.6;margin:0 0 12px">${s}</p>`;

export function verifyEmail(name: string, token: string): Rendered {
  const url = `${env.CLIENT_URL}/verify-email?token=${encodeURIComponent(token)}`;
  return {
    subject: 'Verify your email for Souqly',
    html: layout({
      title: 'Confirm your email',
      bodyHtml: p(`Hi ${esc(name)},`) + p('Please confirm your email address to secure your Souqly account.'),
      cta: { label: 'Verify email', url },
      footerNote: 'This link expires in 24 hours.',
    }),
    template: { key: 'verify_email', vars: { name, url } },
    text: `Hi ${name},\n\nConfirm your email for Souqly:\n${url}\n\nThis link expires in 24 hours.`,
  };
}

export function resetPassword(name: string, token: string): Rendered {
  const url = `${env.CLIENT_URL}/reset-password?token=${encodeURIComponent(token)}`;
  return {
    subject: 'Reset your Souqly password',
    html: layout({
      title: 'Reset your password',
      bodyHtml: p(`Hi ${esc(name)},`) + p('We received a request to reset your password. If this was not you, you can ignore this email.'),
      cta: { label: 'Choose a new password', url },
      footerNote: 'This link expires in 1 hour and can be used once.',
    }),
    template: { key: 'reset_password', vars: { name, url } },
    text: `Hi ${name},\n\nReset your Souqly password:\n${url}\n\nThis link expires in 1 hour. If you did not ask for this, ignore this email.`,
  };
}

export function welcome(name: string): Rendered {
  const url = env.CLIENT_URL;
  return {
    subject: 'Welcome to Souqly!',
    html: layout({
      title: `Welcome, ${name}!`,
      bodyHtml: p('Thousands of shops, one souq. Discover deals, follow your favourite stores, or open your own shop in minutes.'),
      cta: { label: 'Start shopping', url },
    }),
    template: { key: 'welcome', vars: { name, url } },
    text: `Welcome to Souqly, ${name}!\n\nStart shopping: ${url}`,
  };
}

export function orderPlaced(name: string, orderNumber: string, totalFormatted: string): Rendered {
  const url = `${env.CLIENT_URL}/account/orders`;
  return {
    subject: `Order ${orderNumber} placed`,
    html: layout({
      title: 'Thank you for your order!',
      bodyHtml:
        p(`Hi ${esc(name)},`) +
        p(`Your order <strong>${esc(orderNumber)}</strong> has been placed. Total: <strong>${esc(totalFormatted)}</strong>.`) +
        p('We will let you know when the seller ships it.'),
      cta: { label: 'Track your order', url },
    }),
    template: { key: 'order_placed', vars: { name, orderNumber, total: totalFormatted, url } },
    text: `Hi ${name},\n\nYour order ${orderNumber} has been placed. Total: ${totalFormatted}.\nTrack it: ${url}`,
  };
}

export type SecurityEvent = 'two_factor_enabled' | 'two_factor_disabled' | 'recovery_code_used' | 'email_changed' | 'phone_changed';

const SECURITY_COPY: Record<SecurityEvent, { subject: string; title: string; body: string }> = {
  two_factor_enabled: {
    subject: 'Two-factor authentication was turned on',
    title: 'Two-factor authentication is on',
    body: 'Two-factor authentication was just turned on for your Souqly account.',
  },
  two_factor_disabled: {
    subject: 'Two-factor authentication was turned off',
    title: 'Two-factor authentication is off',
    body: 'Two-factor authentication was just turned off for your Souqly account.',
  },
  recovery_code_used: {
    subject: 'A recovery code was used to sign in',
    title: 'Recovery code used',
    body: 'One of your two-factor recovery codes was just used to sign in to your Souqly account.',
  },
  email_changed: {
    subject: 'Your Souqly email address was changed',
    title: 'Email address changed',
    body: 'The email address of your Souqly account was just changed and this address will no longer receive account emails.',
  },
  phone_changed: {
    subject: 'Your Souqly phone number was changed',
    title: 'Phone number changed',
    body: 'The phone number of your Souqly account was just changed.',
  },
};

/** Masks an address for notices: `ab***@example.com`. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 2)}***@${domain}`;
}

/** "Was this you?" notice for security-sensitive account changes. Contains no links with tokens. */
export function securityNotice(name: string, event: SecurityEvent, opts: { newEmail?: string } = {}): Rendered {
  const c = SECURITY_COPY[event];
  const extra = opts.newEmail ? `New address: ${maskEmail(opts.newEmail)}.` : '';
  const warn = 'If this was not you, reset your password right away and contact Souqly support.';
  const url = `${env.CLIENT_URL}/account/security`;
  return {
    subject: c.subject,
    html: layout({
      title: c.title,
      bodyHtml: p(`Hi ${esc(name)},`) + p(esc(c.body)) + (extra ? p(esc(extra)) : '') + p(esc(warn)),
      cta: { label: 'Review account security', url },
    }),
    text: `Hi ${name},\n\n${c.body}${extra ? `\n${extra}` : ''}\n\n${warn}\n${url}`,
  };
}

/** Seller alert for a new sub-order (Phase 6). */
export function newOrderForSeller(storeName: string, orderNumber: string, totalFormatted: string, itemCount: number): Rendered {
  const url = `${env.CLIENT_URL}/seller/orders`;
  return {
    subject: `New order ${orderNumber}`,
    html: layout({
      title: 'You have a new order',
      bodyHtml:
        p(`<strong>${esc(storeName)}</strong> received order <strong>${esc(orderNumber)}</strong> (${itemCount} item${itemCount === 1 ? '' : 's'}, ${esc(totalFormatted)}).`) +
        p('Please confirm it in the Seller Center.'),
      cta: { label: 'Open orders', url },
    }),
    template: { key: 'new_order_seller', vars: { storeName, orderNumber, total: totalFormatted, itemCount: String(itemCount), url } },
    text: `${storeName} received order ${orderNumber} (${itemCount} items, ${totalFormatted}).\nOpen orders: ${url}`,
  };
}

/** Buyer update when a sub-order changes status (Phase 6). */
export function orderStatusChanged(name: string, orderNumber: string, statusLabel: string, extra?: string): Rendered {
  const url = `${env.CLIENT_URL}/account/orders/${encodeURIComponent(orderNumber)}`;
  return {
    subject: `Order ${orderNumber}: ${statusLabel}`,
    html: layout({
      title: `Your order is ${statusLabel.toLowerCase()}`,
      bodyHtml: p(`Hi ${esc(name)},`) + p(`Order <strong>${esc(orderNumber)}</strong> is now <strong>${esc(statusLabel)}</strong>.`) + (extra ? p(esc(extra)) : ''),
      cta: { label: 'View order', url },
    }),
    template: { key: 'order_status_changed', vars: { name, orderNumber, status: statusLabel, extra: extra ?? '', url } },
    text: `Hi ${name},\n\nOrder ${orderNumber} is now ${statusLabel}.${extra ? `\n${extra}` : ''}\nView it: ${url}`,
  };
}
