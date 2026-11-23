import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BadgeCheck, Crown } from 'lucide-react';
import type { SellerStore } from '@souqly/shared';
import { getErrorMessage } from '@/api/client';
import { useMallRequest } from '@/api/seller';
import { Alert, Button, FormField, Input, Switch, Textarea } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useLang } from '@/lib/catalog';
import { SlugField, type SlugState } from '../onboarding/SlugField';
import { PolicyFields } from '../PolicyFields';
import { useStorePatch } from './useStorePatch';

export function PoliciesTab({ store }: { store: SellerStore }) {
  const { t } = useTranslation();
  const patch = useStorePatch();
  const form = useForm({ defaultValues: { policies: { shipping: store.policies.shipping ?? '', returns: store.policies.returns ?? '', warranty: store.policies.warranty ?? '' } } });
  return (
    <FormProvider {...form}>
      <form className="grid gap-5" onSubmit={form.handleSubmit((v) => patch.save({ policies: v.policies }, () => form.reset(v)))}>
        <PolicyFields />
        <Button type="submit" className="w-fit" loading={patch.isPending} disabled={!form.formState.isDirty}>
          {t('seller.common.save')}
        </Button>
      </form>
    </FormProvider>
  );
}

export function SeoTab({ store }: { store: SellerStore }) {
  const { t } = useTranslation();
  const patch = useStorePatch();
  const [title, setTitle] = useState(store.seo.title ?? '');
  const [desc, setDesc] = useState(store.seo.description ?? '');
  return (
    <div className="grid gap-4">
      <FormField label={t('seller.seo.title')} hint={t('seller.seo.count', { n: title.length, max: 70 })}>
        <Input maxLength={70} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={store.name} />
      </FormField>
      <FormField label={t('seller.seo.description')} hint={t('seller.seo.count', { n: desc.length, max: 160 })}>
        <Textarea rows={3} maxLength={160} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={store.tagline} />
      </FormField>
      <div className="rounded-md border border-border p-3">
        <p className="text-xs text-fg-muted">{t('seller.seo.preview')}</p>
        <p className="mt-1 truncate text-base font-semibold text-info">{title || store.name}</p>
        <p className="truncate text-xs text-success" dir="ltr">
          souqly.pk/store/{store.slug}
        </p>
        <p className="line-clamp-2 text-sm text-fg-muted">{desc || store.tagline}</p>
      </div>
      <Button className="w-fit" loading={patch.isPending} onClick={() => patch.save({ seo: { title: title.trim() || undefined, description: desc.trim() || undefined } })}>
        {t('seller.common.save')}
      </Button>
    </div>
  );
}

export function HolidayTab({ store }: { store: SellerStore }) {
  const { t } = useTranslation();
  const patch = useStorePatch();
  const [enabled, setEnabled] = useState(store.holidayMode.enabled);
  const [message, setMessage] = useState(store.holidayMode.message ?? '');
  const [until, setUntil] = useState(store.holidayMode.until?.slice(0, 10) ?? '');
  return (
    <div className="grid gap-4">
      <Switch checked={enabled} onCheckedChange={setEnabled} label={t('seller.holiday.enable')} description={t('seller.holiday.hint')} />
      {enabled && (
        <>
          <FormField label={t('seller.holiday.message')}>
            <Textarea rows={2} maxLength={200} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t('seller.holiday.placeholder')} />
          </FormField>
          <FormField label={t('seller.holiday.until')}>
            <Input type="date" className="w-48" value={until} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setUntil(e.target.value)} />
          </FormField>
        </>
      )}
      <Button
        className="w-fit"
        loading={patch.isPending}
        onClick={() =>
          patch.save({
            holidayMode: { enabled, message: message.trim() || undefined, until: enabled && until ? new Date(`${until}T23:59:59`) : undefined },
          })
        }
      >
        {t('seller.common.save')}
      </Button>
    </div>
  );
}

export function AdvancedTab({ store }: { store: SellerStore }) {
  const { t } = useTranslation();
  const lang = useLang();
  const patch = useStorePatch();
  const mall = useMallRequest();
  const [slug, setSlug] = useState(store.slug);
  const [state, setState] = useState<SlugState>('idle');
  const next = store.slugChangedAt ? new Date(new Date(store.slugChangedAt).getTime() + 30 * 86_400_000) : null;
  const locked = !!next && next > new Date();
  return (
    <div className="grid gap-8">
      <section className="grid gap-3">
        <h3 className="text-sm font-bold text-fg">{t('seller.storeSettings.slugTitle')}</h3>
        <Alert tone="warning">{locked ? t('seller.storeSettings.slugTooSoon', { date: formatDate(next!, lang) }) : t('seller.storeSettings.slugRule')}</Alert>
        <SlugField value={slug} onChange={setSlug} onState={setState} current={store.slug} />
        <Button className="w-fit" disabled={locked || slug === store.slug || state !== 'available'} loading={patch.isPending} onClick={() => patch.save({ slug })}>
          {t('seller.storeSettings.changeSlug')}
        </Button>
      </section>
      <section className="grid gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-fg">
          <Crown className="size-4 text-accent-700" /> {t('seller.mall.title')}
        </h3>
        <p className="text-sm text-fg-muted">{t('seller.mall.body')}</p>
        {store.isMall ? (
          <Alert tone="success" title={t('seller.mall.isMall')} />
        ) : store.mallRequested ? (
          <Alert tone="info" title={t('seller.mall.requested')} />
        ) : (
          <Button
            variant="outline"
            className="w-fit"
            leftIcon={<BadgeCheck className="size-4" />}
            disabled={store.status !== 'approved'}
            loading={mall.isPending}
            onClick={() => mall.mutate(undefined, { onSuccess: () => toast.success(t('seller.mall.requested')), onError: (e) => toast.error(getErrorMessage(e)) })}
          >
            {t('seller.mall.request')}
          </Button>
        )}
        {store.status !== 'approved' && !store.isMall && <p className="text-xs text-fg-muted">{t('seller.mall.needsApproval')}</p>}
      </section>
    </div>
  );
}
