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
    text: `Hi ${name},\n\nYour order ${orderNumber} has been placed. Total: ${totalFormatted}.\nTrack it: ${url}`,
  };
}
