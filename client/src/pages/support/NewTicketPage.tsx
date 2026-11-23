import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Send } from 'lucide-react';
import type { z } from 'zod';
import { TICKET_CATEGORY_VALUES, ticketCreateSchema } from '@souqly/shared';
import { useCreateTicket } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { Seo } from '@/components/layout/Seo';
import { Breadcrumbs, Button, Card, FormField, Input, SectionHeader, Select, Textarea } from '@/components/ui';
import { translateError } from '@/lib/validation';

type Values = z.input<typeof ticketCreateSchema>;

export default function NewTicketPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const create = useCreateTicket();
  const form = useForm<Values>({
    resolver: zodResolver(ticketCreateSchema),
    defaultValues: { subject: '', category: sp.get('order') ? 'order' : 'other', body: '', orderNumber: sp.get('order') ?? '' },
  });
  const { errors } = form.formState;
  const submit = form.handleSubmit((v) =>
    create.mutate(
      { ...v, category: v.category ?? 'other', orderNumber: v.orderNumber?.trim() || undefined },
      { onSuccess: (tk) => (toast.success(t('support.created')), nav(`/account/support/${tk.id}`, { replace: true })), onError: (e) => toast.error(getErrorMessage(e)) },
    ),
  );
  return (
    <>
      <Seo title={t('support.new')} noindex />
      <Breadcrumbs items={[{ label: t('support.title'), to: '/account/support' }, { label: t('support.new') }]} className="mb-3 text-xs" />
      <SectionHeader as="h1" title={t('support.new')} description={t('support.newSubtitle')} />
      <Card className="p-5">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('support.category')}>
              <Select value={form.watch('category')} onValueChange={(v) => form.setValue('category', v as Values['category'])} options={TICKET_CATEGORY_VALUES.map((c) => ({ value: c, label: t(`support.categories.${c}`) }))} />
            </FormField>
            <FormField label={t('support.orderNumber')} hint={t('support.orderHint')} error={translateError(errors.orderNumber?.message)}>
              <Input dir="ltr" placeholder="SQ-…" {...form.register('orderNumber')} />
            </FormField>
          </div>
          <FormField label={t('support.subject')} required error={translateError(errors.subject?.message)}>
            <Input maxLength={160} {...form.register('subject')} />
          </FormField>
          <FormField label={t('support.message')} required error={translateError(errors.body?.message)}>
            <Textarea rows={6} maxLength={5000} {...form.register('body')} />
          </FormField>
          <Button type="submit" className="justify-self-end" loading={create.isPending} leftIcon={<Send className="flip-rtl size-4" />}>
            {t('support.submit')}
          </Button>
        </form>
      </Card>
    </>
  );
}
