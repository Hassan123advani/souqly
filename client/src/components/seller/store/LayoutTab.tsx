import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { STORE_LAYOUTS, STORE_SECTION_TYPES, type SellerStore, type StoreLayout, type StoreSectionType } from '@souqly/shared';
import { useCategoryTree } from '@/api/catalog';
import { Button, FormField, IconButton, Input, Select, Textarea } from '@/components/ui';
import { useLocalized } from '@/lib/catalog';
import { cn } from '@/lib/cn';
import { MediaUpload, type MediaRef } from '../MediaUpload';
import { useStorePatch } from './useStorePatch';

type Section = SellerStore['sections'][number];

/** Tiny wireframe thumbnails of each template. */
function Thumb({ layout, color }: { layout: StoreLayout; color: string }) {
  const block = 'rounded-sm bg-fg/10';
  return (
    <div className="grid h-24 gap-1 rounded-md border border-border bg-surface p-1.5" aria-hidden>
      {layout === 'classic' && (
        <>
          <div className="h-6 rounded-sm" style={{ backgroundColor: color }} />
          <div className="grid grid-cols-4 gap-1">{Array.from({ length: 8 }, (_, i) => <div key={i} className={cn(block, 'h-5')} />)}</div>
        </>
      )}
      {layout === 'bold' && (
        <>
          <div className="h-10 rounded-sm" style={{ backgroundColor: color }} />
          <div className="grid grid-cols-3 gap-1">{Array.from({ length: 3 }, (_, i) => <div key={i} className={cn(block, 'h-7')} />)}</div>
        </>
      )}
      {layout === 'boutique' && (
        <>
          <div className="mx-auto h-2 w-10 rounded-sm" style={{ backgroundColor: color }} />
          <div className="grid grid-cols-2 gap-1.5 px-2">{Array.from({ length: 4 }, (_, i) => <div key={i} className={cn(block, 'h-7')} />)}</div>
        </>
      )}
      {layout === 'minimal' && (
        <>
          <div className="h-1.5 w-12 rounded-sm" style={{ backgroundColor: color }} />
          <div className="grid grid-cols-5 gap-1 pt-2">{Array.from({ length: 10 }, (_, i) => <div key={i} className={cn(block, 'h-5')} />)}</div>
        </>
      )}
    </div>
  );
}

function SectionConfig({ s, onChange }: { s: Section; onChange: (s: Section) => void }) {
  const { t } = useTranslation();
  const loc = useLocalized();
  const tree = useCategoryTree();
  const cfg = s.config as Record<string, unknown>;
  const set = (k: string, v: unknown) => onChange({ ...s, config: { ...cfg, [k]: v } });
  if (s.type === 'category_row')
    return (
      <FormField label={t('seller.editor.category')} className="max-w-sm">
        <Select
          value={(cfg.categoryId as string) ?? ''}
          onValueChange={(v) => set('categoryId', v)}
          placeholder={t('seller.common.choose')}
          options={(tree.data ?? []).map((c) => ({ value: c.id, label: loc(c.name) }))}
        />
      </FormField>
    );
  if (s.type === 'text')
    return (
      <FormField label={t('seller.builder.body')}>
        <Textarea rows={3} maxLength={1000} value={(cfg.body as string) ?? ''} onChange={(e) => set('body', e.target.value)} />
      </FormField>
    );
  if (s.type === 'banner' || s.type === 'hero')
    return (
      <div className="grid gap-3 sm:grid-cols-[260px_1fr]">
        <MediaUpload
          label={t('seller.builder.image')}
          frameClassName="aspect-[2/1]"
          value={cfg.image ? ({ url: cfg.image as string, key: (cfg.imageKey as string) ?? '' } as MediaRef) : null}
          onChange={(v) => onChange({ ...s, config: { ...cfg, image: v?.url, imageKey: v?.key } })}
        />
        <div className="grid gap-3">
          <FormField label={t('seller.builder.subtitle')}>
            <Input maxLength={160} value={(cfg.subtitle as string) ?? ''} onChange={(e) => set('subtitle', e.target.value)} />
          </FormField>
          <FormField label={t('seller.builder.link')} hint={t('seller.builder.linkHint')}>
            <Input dir="ltr" maxLength={200} value={(cfg.link as string) ?? ''} onChange={(e) => set('link', e.target.value)} />
          </FormField>
        </div>
      </div>
    );
  return (
    <FormField label={t('seller.builder.limit')} className="max-w-[12rem]">
      <Select
        value={String((cfg.limit as number) ?? 8)}
        onValueChange={(v) => set('limit', Number(v))}
        options={[4, 8, 12, 16, 24].map((n) => ({ value: String(n), label: String(n) }))}
      />
    </FormField>
  );
}

export function LayoutTab({ store }: { store: SellerStore }) {
  const { t } = useTranslation();
  const patch = useStorePatch();
  const [layout, setLayout] = useState<StoreLayout>(store.layoutTemplate);
  const [sections, setSections] = useState<Section[]>(store.sections);
  const [adding, setAdding] = useState<StoreSectionType>('featured');
  const dirty = layout !== store.layoutTemplate || JSON.stringify(sections) !== JSON.stringify(store.sections);

  const move = (i: number, d: -1 | 1) => {
    const n = [...sections];
    const [it] = n.splice(i, 1);
    n.splice(i + d, 0, it!);
    setSections(n);
  };

  return (
    <div className="grid gap-6">
      <fieldset>
        <legend className="mb-3 text-sm font-bold text-fg">{t('seller.builder.template')}</legend>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {STORE_LAYOUTS.map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={layout === l}
              onClick={() => setLayout(l)}
              className={cn('grid gap-2 rounded-lg border-2 p-2 text-start transition-colors', layout === l ? 'border-primary bg-primary-50' : 'border-border hover:border-primary-300')}
            >
              <Thumb layout={l} color={store.themeColor} />
              <span className="text-sm font-bold text-fg">{t(`seller.builder.layouts.${l}.name`)}</span>
              <span className="text-xs text-fg-muted">{t(`seller.builder.layouts.${l}.hint`)}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-bold text-fg">{t('seller.builder.sections')}</legend>
        {!sections.length && <p className="text-sm text-fg-muted">{t('seller.builder.noSections')}</p>}
        {sections.map((s, i) => (
          <div key={i} className="grid gap-3 rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <span className="rounded-pill bg-surface-2 px-2.5 py-1 text-xs font-bold text-fg">{t(`seller.builder.types.${s.type}`)}</span>
              <Input
                value={s.title ?? ''}
                maxLength={80}
                placeholder={t('seller.builder.titlePlaceholder')}
                aria-label={t('seller.builder.sectionTitle')}
                onChange={(e) => setSections(sections.map((x, j) => (j === i ? { ...x, title: e.target.value || undefined } : x)))}
                className="h-9 flex-1"
              />
              <IconButton label={t('seller.builder.up')} size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp className="size-4" />
              </IconButton>
              <IconButton label={t('seller.builder.down')} size="sm" variant="ghost" disabled={i === sections.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown className="size-4" />
              </IconButton>
              <IconButton label={t('seller.common.remove')} size="sm" variant="ghost" onClick={() => setSections(sections.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" />
              </IconButton>
            </div>
            <SectionConfig s={s} onChange={(n) => setSections(sections.map((x, j) => (j === i ? n : x)))} />
          </div>
        ))}
        {sections.length < 20 && (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={adding}
              onValueChange={(v) => setAdding(v as StoreSectionType)}
              aria-label={t('seller.builder.addSection')}
              className="w-56"
              options={STORE_SECTION_TYPES.map((s) => ({ value: s, label: t(`seller.builder.types.${s}`) }))}
            />
            <Button type="button" variant="outline" leftIcon={<Plus className="size-4" />} onClick={() => setSections([...sections, { type: adding, config: {} }])}>
              {t('seller.builder.addSection')}
            </Button>
          </div>
        )}
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button loading={patch.isPending} disabled={!dirty} onClick={() => patch.save({ layoutTemplate: layout, sections })}>
          {t('seller.common.save')}
        </Button>
        <Button href={`/store/${store.slug}`} target="_blank" rel="noopener" variant="outline" rightIcon={<ExternalLink className="size-4" />}>
          {t('seller.builder.preview')}
        </Button>
      </div>
    </div>
  );
}
