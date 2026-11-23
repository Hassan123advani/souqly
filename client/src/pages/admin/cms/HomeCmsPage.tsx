import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ExternalLink, Plus, Save, Trash2 } from 'lucide-react';
import { adminHomeSchema } from '@souqly/shared';
import { useAdminGet, useAdminMutation, type HeroSlide, type HomeContent, type HomeSection, type HomeSectionType } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { ImageUpload } from '@/components/admin/ImageUpload';
import { PageHeader } from '@/components/admin/PageHeader';
import { ProductPicker } from '@/components/admin/ProductPicker';
import { Alert, Badge, Button, Card, CardHeader, ErrorState, FormField, IconButton, Input, Select, Skeleton, Switch } from '@/components/ui';
import { cn } from '@/lib/cn';

const SECTION_TYPES: HomeSectionType[] = ['trending', 'new_arrivals', 'top_rated', 'best_sellers', 'mall', 'top_stores', 'campaign'];
/** Same fallback backgrounds as the storefront HeroCarousel (keyed by `theme`). */
const THEME_BG: Record<string, string> = {
  teal: 'linear-gradient(120deg,#0B4A47,#0E5E5A)',
  saffron: 'linear-gradient(120deg,#8A4B0F,#D98A1E)',
  ink: 'linear-gradient(120deg,#1B2A29,#2F4A47)',
  pomegranate: 'linear-gradient(120deg,#7E1F1A,#D6453D)',
};
const THEMES = Object.keys(THEME_BG);

function move<T>(xs: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= xs.length) return xs;
  const n = [...xs];
  [n[i], n[j]] = [n[j]!, n[i]!];
  return n;
}

export default function HomeCmsPage() {
  const { t } = useTranslation();
  const q = useAdminGet<HomeContent>('cms/home');
  const put = useAdminMutation('put', ['cms']);
  const [draft, setDraft] = useState<HomeContent | null>(null);
  const [open, setOpen] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (q.data && !draft) setDraft(q.data);
  }, [q.data, draft]);

  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!draft)
    return (
      <div className="grid gap-4">
        <Skeleton className="h-16 w-1/3" />
        <Skeleton className="h-96" />
      </div>
    );

  const dirty = JSON.stringify(draft) !== JSON.stringify(q.data);
  const setSlides = (heroSlides: HeroSlide[]) => setDraft({ ...draft, heroSlides });
  const setSlide = (i: number, p: Partial<HeroSlide>) => setSlides(draft.heroSlides.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const setSections = (sections: HomeSection[]) => setDraft({ ...draft, sections });
  const setSection = (i: number, p: Partial<HomeSection>) => setSections(draft.sections.map((s, j) => (j === i ? { ...s, ...p } : s)));

  function save() {
    if (!draft) return;
    const clean = (v?: string) => (v?.trim() ? v.trim() : undefined);
    const body = {
      heroSlides: draft.heroSlides.map((s) => ({ image: s.image, title: s.title, subtitle: clean(s.subtitle), ctaText: clean(s.ctaText), ctaLink: clean(s.ctaLink), theme: clean(s.theme) })),
      sections: draft.sections.map((s) => ({ type: s.type, title: s.title, enabled: s.enabled, config: s.config ?? {} })),
      featured: draft.featured,
    };
    const parsed = adminHomeSchema.safeParse(body);
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      return setError(`${i?.path.join(' › ')}: ${i?.message}`);
    }
    setError(null);
    put.mutate({ path: 'cms/home', body: parsed.data }, { onSuccess: () => (toast.success(t('admin.cms.published')), void q.refetch().then((r) => r.data && setDraft(r.data))), onError: (e) => toast.error(getErrorMessage(e)) });
  }

  return (
    <>
      <PageHeader
        title={t('admin.nav.homeCms')}
        description={t('admin.cms.homeSub')}
        crumbs={[{ label: t('admin.nav.content') }]}
        actions={
          <>
            <Button variant="ghost" size="sm" href="/" target="_blank" rel="noopener noreferrer" rightIcon={<ExternalLink className="size-3.5" />}>
              {t('admin.cms.viewSite')}
            </Button>
            {dirty && (
              <Button variant="outline" size="sm" onClick={() => setDraft(q.data ?? null)}>
                {t('admin.cms.discard')}
              </Button>
            )}
            <Button size="sm" disabled={!dirty} loading={put.isPending} leftIcon={<Save className="size-4" />} onClick={save}>
              {t('admin.cms.publish')}
            </Button>
          </>
        }
      />
      {error && (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      )}
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader
            title={t('admin.cms.heroSlides')}
            description={t('admin.cms.heroHint', { count: draft.heroSlides.length })}
            action={
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Plus className="size-4" />}
                disabled={draft.heroSlides.length >= 12}
                onClick={() => (setSlides([...draft.heroSlides, { image: '', title: t('admin.cms.newSlide'), theme: 'teal' }]), setOpen(draft.heroSlides.length))}
              >
                {t('admin.cms.addSlide')}
              </Button>
            }
          />
          <ul className="divide-y divide-border border-t border-border">
            {!draft.heroSlides.length && <li className="p-6 text-center text-sm text-fg-muted">{t('admin.cms.noSlides')}</li>}
            {draft.heroSlides.map((s, i) => (
              <li key={i}>
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <button type="button" onClick={() => setOpen(open === i ? -1 : i)} className="flex min-w-0 flex-1 items-center gap-3 text-start" aria-expanded={open === i}>
                    {open === i ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="flip-rtl size-4 shrink-0" />}
                    <span className="h-10 w-16 shrink-0 overflow-hidden rounded bg-surface-2">{s.image && <img src={s.image} alt="" className="size-full object-cover" />}</span>
                    <span className="truncate text-sm font-semibold">{s.title || '—'}</span>
                  </button>
                  <IconButton size="sm" variant="ghost" label={t('admin.catalog.moveUp')} disabled={i === 0} onClick={() => (setSlides(move(draft.heroSlides, i, -1)), setOpen(i - 1))}>
                    <ArrowUp className="size-4" />
                  </IconButton>
                  <IconButton size="sm" variant="ghost" label={t('admin.catalog.moveDown')} disabled={i === draft.heroSlides.length - 1} onClick={() => (setSlides(move(draft.heroSlides, i, 1)), setOpen(i + 1))}>
                    <ArrowDown className="size-4" />
                  </IconButton>
                  <IconButton size="sm" variant="ghost" label={t('admin.common.remove')} onClick={() => setSlides(draft.heroSlides.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
                {open === i && (
                  <div className="grid gap-3 bg-surface-2/40 px-4 pb-4 pt-1 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <FormField label={t('admin.cms.image')} required>
                        <ImageUpload label={t('admin.cms.image')} value={s.image} onChange={(image) => setSlide(i, { image })} />
                      </FormField>
                    </div>
                    <FormField label={t('admin.cms.slideTitle')} required>
                      <Input value={s.title} maxLength={120} onChange={(e) => setSlide(i, { title: e.target.value })} />
                    </FormField>
                    <FormField label={t('admin.cms.subtitle')}>
                      <Input value={s.subtitle ?? ''} maxLength={200} onChange={(e) => setSlide(i, { subtitle: e.target.value })} />
                    </FormField>
                    <FormField label={t('admin.cms.ctaText')}>
                      <Input value={s.ctaText ?? ''} maxLength={40} onChange={(e) => setSlide(i, { ctaText: e.target.value })} />
                    </FormField>
                    <FormField label={t('admin.cms.ctaLink')}>
                      <Input dir="ltr" value={s.ctaLink ?? ''} placeholder="/campaign/…" onChange={(e) => setSlide(i, { ctaLink: e.target.value })} />
                    </FormField>
                    <FormField label={t('admin.cms.theme')}>
                      <div className="flex gap-2">
                        {THEMES.map((th) => (
                          <button
                            key={th}
                            type="button"
                            aria-label={th}
                            aria-pressed={s.theme === th}
                            onClick={() => setSlide(i, { theme: th })}
                            style={{ background: THEME_BG[th] }}
                            className={cn('size-8 rounded-full ring-offset-2 ring-offset-surface', s.theme === th && 'ring-2 ring-primary')}
                          />
                        ))}
                      </div>
                    </FormField>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <div className="grid content-start gap-4 xl:sticky xl:top-20">
          <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">{t('admin.cms.livePreview')}</p>
          <SlidePreview slide={draft.heroSlides[open] ?? draft.heroSlides[0]} />
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader
          title={t('admin.cms.sections')}
          description={t('admin.cms.sectionsHint')}
          action={
            <Button size="sm" variant="outline" leftIcon={<Plus className="size-4" />} disabled={draft.sections.length >= 20} onClick={() => setSections([...draft.sections, { type: 'trending', title: t('admin.cms.sectionTypes.trending'), enabled: false, config: {} }])}>
              {t('admin.cms.addSection')}
            </Button>
          }
        />
        <ul className="divide-y divide-border border-t border-border">
          {draft.sections.map((s, i) => (
            <li key={i} className={cn('grid items-center gap-3 px-4 py-3 md:grid-cols-[auto_180px_1fr_160px_auto]', !s.enabled && 'bg-surface-2/40')}>
              <Switch checked={s.enabled} onCheckedChange={(enabled) => setSection(i, { enabled })} label={<span className="sr-only">{s.title}</span>} />
              <Select value={s.type} onValueChange={(type) => setSection(i, { type: type as HomeSectionType })} options={SECTION_TYPES.map((x) => ({ value: x, label: t(`admin.cms.sectionTypes.${x}`) }))} />
              <Input value={s.title} maxLength={80} onChange={(e) => setSection(i, { title: e.target.value })} aria-label={t('admin.cms.sectionTitle')} />
              {s.type === 'campaign' ? (
                <Input dir="ltr" value={String(s.config.slug ?? '')} placeholder={t('admin.cms.campaignSlug')} aria-label={t('admin.cms.campaignSlug')} onChange={(e) => setSection(i, { config: { ...s.config, slug: e.target.value } })} />
              ) : (
                <Input type="number" min={4} max={24} value={String(s.config.limit ?? '')} placeholder={t('admin.cms.limit')} aria-label={t('admin.cms.limit')} onChange={(e) => setSection(i, { config: { ...s.config, ...(e.target.value ? { limit: Number(e.target.value) } : {}) } })} />
              )}
              <div className="flex justify-end">
                <IconButton size="sm" variant="ghost" label={t('admin.catalog.moveUp')} disabled={i === 0} onClick={() => setSections(move(draft.sections, i, -1))}>
                  <ArrowUp className="size-4" />
                </IconButton>
                <IconButton size="sm" variant="ghost" label={t('admin.catalog.moveDown')} disabled={i === draft.sections.length - 1} onClick={() => setSections(move(draft.sections, i, 1))}>
                  <ArrowDown className="size-4" />
                </IconButton>
                <IconButton size="sm" variant="ghost" label={t('admin.common.remove')} onClick={() => setSections(draft.sections.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-4">
        <CardHeader title={t('admin.cms.featured')} description={t('admin.cms.featuredHint')} />
        <div className="p-5">
          <ProductPicker
            exclude={draft.featured.productIds}
            onPick={(p) => draft.featured.productIds.length < 50 && setDraft({ ...draft, featured: { ...draft.featured, productIds: [...draft.featured.productIds, p.id] } })}
          />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {!draft.featured.productIds.length && <p className="text-sm text-fg-muted">{t('admin.cms.noFeatured')}</p>}
            {draft.featured.productIds.map((id) => (
              <Badge key={id} tone="primary" className="gap-1.5">
                <span className="latin font-mono">#{id.slice(-6)}</span>
                <button type="button" aria-label={t('admin.common.remove')} onClick={() => setDraft({ ...draft, featured: { ...draft.featured, productIds: draft.featured.productIds.filter((x) => x !== id) } })}>
                  ×
                </button>
              </Badge>
            ))}
          </div>
        </div>
      </Card>
    </>
  );
}

/** Mirrors the storefront hero: artwork carries its own headline; without artwork the themed text slide shows. */
function SlidePreview({ slide }: { slide?: HeroSlide }) {
  const { t } = useTranslation();
  if (!slide) return <Card className="grid aspect-[8/3] place-items-center text-sm text-fg-muted">{t('admin.cms.noSlides')}</Card>;
  return (
    <div className="relative aspect-[8/3] overflow-hidden rounded-xl shadow-card">
      {slide.image ? (
        <img src={slide.image} alt="" className="size-full object-cover" />
      ) : (
        <div className="flex size-full flex-col justify-center gap-1 p-5 text-white" style={{ background: THEME_BG[slide.theme ?? ''] ?? THEME_BG.teal }}>
          <p className="text-xl font-extrabold leading-tight">{slide.title || '—'}</p>
          {slide.subtitle && <p className="text-xs opacity-90">{slide.subtitle}</p>}
        </div>
      )}
      {slide.ctaText && (
        <span dir="ltr" className="absolute bottom-[14%] left-[7%] inline-flex h-7 items-center rounded-pill bg-accent px-3 text-xs font-bold text-accent-fg shadow-pop">
          {slide.ctaText}
        </span>
      )}
    </div>
  );
}
