import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod';
import { ArrowLeft, Minus, Plus, Undo2 } from 'lucide-react';
import { createReturnSchema, MAX_RETURN_PHOTOS, RETURN_REASONS } from '@souqly/shared';
import { useFlag } from '@/api/config';
import { useBuyerOrder } from '@/api/orders';
import { getErrorMessage, getErrorStatus } from '@/api/client';
import { useCreateReturn } from '@/api/returns';
import type { UploadedImage } from '@/api/delivery';
import { Alert, Button, Card, Checkbox, EmptyState, ErrorState, FormField, Select, Skeleton, Textarea } from '@/components/ui';
import { Seo } from '@/components/layout/Seo';
import { ProductImage } from '@/components/product/ProductImage';
import { PhotoPicker } from '@/components/returns/PhotoPicker';
import { money } from '@/lib/format';

type Values = z.input<typeof createReturnSchema>;

function Stepper({ value, max, onChange, label }: { value: number; max: number; onChange: (n: number) => void; label: string }) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex items-center rounded-pill border border-border" role="group" aria-label={label}>
      <button type="button" className="grid size-9 place-items-center rounded-pill disabled:opacity-40" disabled={value <= 1} onClick={() => onChange(value - 1)} aria-label={t('returns.form.less')}>
        <Minus className="size-4" />
      </button>
      <span className="latin w-7 text-center text-sm font-bold tabular" aria-live="polite">
        {value}
      </span>
      <button type="button" className="grid size-9 place-items-center rounded-pill disabled:opacity-40" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={t('returns.form.more')}>
        <Plus className="size-4" />
      </button>
    </div>
  );
}

export default function ReturnRequestPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { number = '' } = useParams();
  const q = useBuyerOrder(number);
  const returnsOn = useFlag('returns');
  const create = useCreateReturn(number);
  const [photos, setPhotos] = useState<UploadedImage[]>([]);
  const form = useForm<Values>({ resolver: zodResolver(createReturnSchema), defaultValues: { items: [], description: '', photos: [] } });
  const { errors } = form.formState;
  const items = form.watch('items');

  const back = (
    <Link to={`/account/orders/${number}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg">
      <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
      {t('returns.form.backToOrder')}
    </Link>
  );

  if (q.isPending)
    return (
      <div className="space-y-4" aria-busy>
        {back}
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  if (q.isError)
    return (
      <div className="space-y-4">
        {back}
        <Card>
          {getErrorStatus(q.error) === 404 ? (
            <EmptyState title={t('orders.notFound')} action={<Button to="/account/orders">{t('orders.back')}</Button>} />
          ) : (
            <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          )}
        </Card>
      </div>
    );

  const o = q.data;
  if (!returnsOn || o.status !== 'delivered')
    return (
      <div className="space-y-4">
        {back}
        <Card>
          <EmptyState icon={<Undo2 />} title={t('returns.form.notEligible')} description={t('returns.form.notEligibleBody')} action={<Button to="/account/returns">{t('returns.title')}</Button>} />
        </Card>
      </div>
    );

  const selected = (variantId: string) => items.find((i) => i.variantId === variantId);
  function toggle(variantId: string, on: boolean) {
    const next = on ? [...items, { variantId, qty: 1 }] : items.filter((i) => i.variantId !== variantId);
    form.setValue('items', next, { shouldValidate: form.formState.isSubmitted });
  }
  function setQty(variantId: string, qty: number) {
    form.setValue('items', items.map((i) => (i.variantId === variantId ? { ...i, qty } : i)));
  }
  const refund = items.reduce((sum, i) => sum + (o.items.find((x) => x.variantId === i.variantId)?.price ?? 0) * i.qty, 0);

  const submit = form.handleSubmit((raw) => {
    const body = createReturnSchema.parse({ ...raw, photos: photos.map((p) => p.ref) });
    create.mutate(body, {
      onSuccess: (r) => {
        toast.success(t('returns.form.submitted'));
        navigate(`/account/returns/${r.id}`, { replace: true });
      },
      onError: (e) => toast.error(getErrorMessage(e)),
    });
  });

  return (
    <form className="space-y-4" onSubmit={(e) => void submit(e)} noValidate>
      <Seo title={t('returns.form.title')} noindex />
      {back}
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-fg">{t('returns.form.title')}</h2>
        <p className="latin mt-1 text-sm text-fg-muted" dir="ltr">
          {o.number}
        </p>
      </div>

      <Card className="p-4 sm:p-5">
        <h3 className="text-sm font-bold text-fg">{t('returns.form.whichItems')}</h3>
        <ul className="mt-2 divide-y divide-border">
          {o.items.map((i) => {
            const sel = selected(i.variantId);
            return (
              <li key={i.variantId} className="flex flex-wrap items-center gap-3 py-3">
                <Checkbox checked={!!sel} onChange={(e) => toggle(i.variantId, e.target.checked)} aria-label={i.title} />
                <ProductImage src={i.image} alt="" className="size-14 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium text-fg">{i.title}</p>
                  <p className="truncate text-xs text-fg-subtle">{[...Object.values(i.options), `${money(i.price)} × ${i.qty}`].join(' · ')}</p>
                </div>
                {sel && i.qty > 1 && <Stepper value={sel.qty} max={i.qty} onChange={(n) => setQty(i.variantId, n)} label={t('returns.form.qty')} />}
              </li>
            );
          })}
        </ul>
        {errors.items && <p className="mt-1 text-xs font-medium text-danger">{t('returns.form.pickItem')}</p>}
      </Card>

      <Card className="space-y-4 p-4 sm:p-5">
        <FormField label={t('returns.form.reason')} required error={errors.reason ? t('returns.form.pickReason') : undefined}>
          <Controller
            control={form.control}
            name="reason"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                placeholder={t('returns.form.reasonPlaceholder')}
                options={RETURN_REASONS.map((r) => ({ value: r, label: t(`returns.reasons.${r}`) }))}
              />
            )}
          />
        </FormField>
        <FormField label={t('returns.form.description')} hint={t('returns.form.descriptionHint')} error={errors.description?.message}>
          <Textarea rows={4} maxLength={2000} {...form.register('description')} />
        </FormField>
        <FormField label={t('returns.form.photos')} hint={t('returns.form.photosHint', { max: MAX_RETURN_PHOTOS })}>
          <PhotoPicker endpoint="/returns/uploads" value={photos} onChange={setPhotos} max={MAX_RETURN_PHOTOS} />
        </FormField>
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <div>
          <p className="text-xs text-fg-muted">{t('returns.form.estimatedRefund')}</p>
          <p className="latin text-lg font-extrabold tabular text-fg" dir="ltr">
            {money(Math.min(refund, o.total))}
          </p>
        </div>
        <Button type="submit" loading={create.isPending} leftIcon={<Undo2 className="size-4" />}>
          {t('returns.form.submit')}
        </Button>
      </Card>
      <Alert tone="info">{t('returns.form.policy')}</Alert>
    </form>
  );
}
