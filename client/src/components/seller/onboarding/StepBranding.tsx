import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { OnboardingInput } from '@souqly/shared';
import { Avatar } from '@/components/ui';
import { readableOn } from '@/lib/contrast';
import { MediaUpload } from '../MediaUpload';

/** Logo + banner (both optional) with a storefront header preview. */
export function StepBranding() {
  const { t } = useTranslation();
  const { control, watch } = useFormContext<OnboardingInput>();
  const [logo, banner, name, color, tagline] = watch(['logo', 'banner', 'name', 'themeColor', 'tagline']);
  return (
    <div className="grid gap-6">
      <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
        <Controller
          control={control}
          name="logo"
          render={({ field }) => (
            <MediaUpload label={t('seller.branding.logo')} hint={t('seller.branding.logoHint')} value={field.value} onChange={(v) => field.onChange(v ?? undefined)} />
          )}
        />
        <Controller
          control={control}
          name="banner"
          render={({ field }) => (
            <MediaUpload
              label={t('seller.branding.banner')}
              hint={t('seller.branding.bannerHint')}
              frameClassName="aspect-[3/1]"
              value={field.value}
              onChange={(v) => field.onChange(v ?? undefined)}
            />
          )}
        />
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-fg">{t('seller.branding.preview')}</p>
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="relative aspect-[4/1] w-full" style={{ backgroundColor: color }}>
            {banner?.url && <img src={banner.url} alt="" className="size-full object-cover" />}
          </div>
          <div className="flex items-center gap-3 p-4">
            <span className="-mt-10 rounded-full border-4 border-surface bg-surface">
              <Avatar size="lg" src={logo?.url} name={name} />
            </span>
            <div className="min-w-0">
              <p className="truncate font-bold text-fg">{name || t('seller.theme.sampleName')}</p>
              {tagline && <p className="truncate text-sm text-fg-muted">{tagline}</p>}
            </div>
            <span className="ms-auto rounded-md px-3 py-1.5 text-xs font-bold" style={{ backgroundColor: color, color: readableOn(color) }}>
              {t('seller.branding.follow')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
