import { PERMISSIONS, adminEmailTemplateSchema, adminEmailTestSchema } from '@souqly/shared';
import { Router } from 'express';
import { z } from 'zod';
import { AppError, notFound } from '../../lib/AppError';
import { asyncHandler } from '../../lib/asyncHandler';
import { validate } from '../../middleware/validate';
import { getEmail, type EmailMessage } from '../../services/email';
import { clearTemplateOverrideCache, renderOverride } from '../../services/email/overrides';
import * as T from '../../services/email/templates';
import { audit } from '../audit/audit.service';
import { can, iso, oid } from './common';
import { EmailTemplateOverride } from './emailTemplate.model';

export const adminEmailTemplatesRouter = Router();
const SETTINGS = PERMISSIONS.ADMIN_SETTINGS_MANAGE;

type Rendered = Omit<EmailMessage, 'to'>;
/** Built-in templates that can be overridden. `sample()` renders the default with demo variables. */
export const BUILT_IN_TEMPLATES: { key: string; description: string; sample: () => Rendered }[] = [
  { key: 'verify_email', description: 'Email verification link', sample: () => T.verifyEmail('Ayesha', 'sample-token') },
  { key: 'reset_password', description: 'Password reset link', sample: () => T.resetPassword('Ayesha', 'sample-token') },
  { key: 'welcome', description: 'Welcome after sign-up', sample: () => T.welcome('Ayesha') },
  { key: 'order_placed', description: 'Buyer: order placed', sample: () => T.orderPlaced('Ayesha', 'SQ-240101-0001-A', 'Rs. 2,499') },
  { key: 'new_order_seller', description: 'Seller: new order', sample: () => T.newOrderForSeller('Noor Textiles', 'SQ-240101-0001-A', 'Rs. 2,499', 2) },
  { key: 'order_status_changed', description: 'Buyer: order status update', sample: () => T.orderStatusChanged('Ayesha', 'SQ-240101-0001-A', 'Shipped') },
];
const keyParams = z.object({ key: z.enum(BUILT_IN_TEMPLATES.map((t) => t.key) as [string, ...string[]]) });
const builtIn = (key: string) => BUILT_IN_TEMPLATES.find((t) => t.key === key)!;

adminEmailTemplatesRouter.get(
  '/email-templates',
  ...can(SETTINGS),
  asyncHandler(async (_req, res) => {
    const rows = await EmailTemplateOverride.find().lean();
    res.json({
      data: BUILT_IN_TEMPLATES.map((t) => {
        const s = t.sample();
        const o = rows.find((r) => r.key === t.key);
        return {
          key: t.key,
          description: t.description,
          variables: Object.keys(s.template?.vars ?? {}),
          defaultSubject: s.subject,
          override: o ? { subject: o.subject, html: o.html, updatedAt: iso(o.updatedAt) } : null,
        };
      }),
    });
  }),
);

adminEmailTemplatesRouter.put(
  '/email-templates/:key',
  ...can(SETTINGS),
  validate({ params: keyParams, body: adminEmailTemplateSchema }),
  asyncHandler(async (req, res) => {
    await EmailTemplateOverride.updateOne({ key: req.params.key }, { $set: { subject: req.body.subject, html: req.body.html, updatedBy: oid(req.user!.id) } }, { upsert: true });
    clearTemplateOverrideCache();
    await audit({ action: 'admin.email_template_updated', targetType: 'EmailTemplate', targetId: req.params.key, req });
    res.json({ data: { key: req.params.key } });
  }),
);

adminEmailTemplatesRouter.delete(
  '/email-templates/:key',
  ...can(SETTINGS),
  validate({ params: keyParams }),
  asyncHandler(async (req, res) => {
    const r = await EmailTemplateOverride.deleteOne({ key: req.params.key });
    if (!r.deletedCount) throw notFound('Template override');
    clearTemplateOverrideCache();
    await audit({ action: 'admin.email_template_reset', targetType: 'EmailTemplate', targetId: req.params.key, req });
    res.status(204).end();
  }),
);

/** Renders the template with sample data: the posted draft (if any), else the saved override, else the default. */
async function preview(key: string, draft?: { subject: string; html: string }): Promise<Rendered> {
  const sample = builtIn(key).sample();
  const o = draft ?? (await EmailTemplateOverride.findOne({ key }).lean()) ?? undefined;
  return o ? renderOverride(o, sample.template?.vars ?? {}) : { subject: sample.subject, html: sample.html, text: sample.text };
}

adminEmailTemplatesRouter.post(
  '/email-templates/:key/preview',
  ...can(SETTINGS),
  validate({ params: keyParams, body: adminEmailTemplateSchema.partial() }),
  asyncHandler(async (req, res) => {
    const draft = req.body.subject && req.body.html ? { subject: req.body.subject as string, html: req.body.html as string } : undefined;
    const r = await preview(req.params.key!, draft);
    res.json({ data: { subject: r.subject, html: r.html, text: r.text } });
  }),
);

adminEmailTemplatesRouter.post(
  '/email-templates/:key/test',
  ...can(SETTINGS),
  validate({ params: keyParams, body: adminEmailTestSchema }),
  asyncHandler(async (req, res) => {
    const r = await preview(req.params.key!);
    try {
      // Sent without `template` so the preview is exactly what was rendered above.
      await getEmail().send({ to: req.body.to, subject: `[Test] ${r.subject}`, html: r.html, text: r.text });
    } catch {
      throw new AppError(502, 'EMAIL_FAILED', 'The test email could not be sent');
    }
    await audit({ action: 'admin.email_template_test_sent', targetType: 'EmailTemplate', targetId: req.params.key, req });
    res.json({ data: { sent: true } });
  }),
);
