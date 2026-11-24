import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, ExternalLink, Save, Send, Sparkles } from 'lucide-react';
import { PERMISSIONS, productCreateSchema, type SellerProduct } from '@souqly/shared';
import { useCategoryTree } from '@/api/catalog';
import { getErrorMessage } from '@/api/client';
import { useFlag } from '@/api/config';
import { useProductAction, useSaveProduct, useSellerProduct } from '@/api/seller';
import { Seo } from '@/components/layout/Seo';
import { Alert, Badge, Button, Card, CardHeader, ErrorState, FormField, Input, PageSpinner, Select, Switch, Textarea } from '@/components/ui';
import { MediaUpload } from '@/components/seller/MediaUpload';
import { AttributesFields } from '@/components/seller/product/AttributesFields';
import { CategoryPicker, findPath } from '@/components/seller/product/CategoryPicker';
import { ImagesField } from '@/components/seller/product/ImagesField';
import { emptyProduct, fromProduct, toPayload, type ProductForm } from '@/components/seller/product/model';
import { OptionsVariants } from '@/components/seller/product/OptionsVariants';
import { Repeater } from '@/components/seller/product/Repeater';
import { RichTextEditor } from '@/components/seller/product/RichTextEditor';
import { PublishPausedAlert } from '@/components/billing/PublishPausedAlert';
import { useBillingSuspension } from '@/components/billing/SuspendedBanner';
import { useCan } from '@/components/seller/usePermissions';
import { PRODUCT_TONES } from './ProductsPage';

export default function ProductEditorPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const q = useSellerProduct(isNew ? undefined : id);
  if (!isNew && q.isLoading) return <PageSpinner />;
  if (!isNew && (q.error || !q.data)) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return <Editor key={q.data?.id ?? 'new'} product={isNew ? undefined : q.data} />;
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <div className="grid gap-4 p-5 sm:p-6">{children}</div>
    </Card>
  );
}

function Editor({ product }: { product?: SellerProduct }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const can = useCan();
  const readOnly = !can(PERMISSIONS.STORE_PRODUCTS_MANAGE);
  const publishPaused = useBillingSuspension().suspended === true;
  const aiHelper = useFlag('aiDescriptionHelper');
  const preOrderFlag = useFlag('preOrders');
  const wholesaleFlag = useFlag('wholesaleTiers');
  const save = useSaveProduct();
  const action = useProductAction();
  const tree = useCategoryTree();
  const [variantErrors, setVariantErrors] = useState<Record<number, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const initial = useMemo(() => (product ? fromProduct(product) : emptyProduct()), [product]);
  const { register, control, watch, setValue, getValues, handleSubmit, formState, reset } = useForm<ProductForm>({ defaultValues: initial });
  const [categoryId, options, variants, highlights, specs, wholesale, preOrder, warrantyType] = watch([
    'categoryId',
    'options',
    'variants',
    'highlights',
    'specs',
    'wholesale',
    'preOrder',
    'warrantyType',
  ]);
  const categorySlug = useMemo(() => (tree.data && categoryId ? findPath(tree.data, categoryId).at(-1)?.slug : undefined), [tree.data, categoryId]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!formState.isDirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [formState.isDirty]);

  function submit(publish: boolean) {
    return handleSubmit(async (f) => {
      setFormError(null);
      setVariantErrors({});
      const parsed = productCreateSchema.safeParse(toPayload(f));
      if (!parsed.success) {
        const vErr: Record<number, string> = {};
        for (const iss of parsed.error.issues) if (iss.path[0] === 'variants' && typeof iss.path[1] === 'number') vErr[iss.path[1]] ??= iss.message;
        setVariantErrors(vErr);
        const first = parsed.error.issues[0]!;
        setFormError(`${t(`seller.editor.paths.${String(first.path[0])}`, String(first.path[0]))}: ${first.message}`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      try {
        const saved = await save.mutateAsync({ id: product?.id, body: parsed.data });
        if (publish && saved) await action.mutateAsync({ id: saved.id, action: 'publish' });
        if (saved) reset(fromProduct(saved));
        toast.success(publish ? t('seller.editor.publishedToast') : t('seller.editor.savedToast'));
        if (!product && saved) navigate(`/seller/products/${saved.id}`, { replace: true });
      } catch (e) {
        toast.error(getErrorMessage(e));
      }
    });
  }

  function aiDraft() {
    const f = getValues();
    const parts = [
      `<p>${escapeHtml(f.title)}</p>`,
      f.highlights.length ? `<h3>${escapeHtml(t('seller.editor.highlights'))}</h3><ul>${f.highlights.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}</ul>` : '',
      f.specs.length ? `<h3>${escapeHtml(t('seller.editor.specs'))}</h3><ul>${f.specs.map((s) => `<li><b>${escapeHtml(s.label)}</b>: ${escapeHtml(s.value)}</li>`).join('')}</ul>` : '',
    ];
    setValue('description', parts.join(''), { shouldDirty: true });
  }

  const busy = save.isPending || action.isPending;
  return (
    <>
      <Seo title={product ? product.title : t('seller.editor.newTitle')} noindex />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button to="/seller/products" variant="ghost" size="sm" leftIcon={<ArrowLeft className="flip-rtl size-4" />}>
          {t('seller.nav.products')}
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-extrabold text-fg sm:text-2xl">{product ? product.title : t('seller.editor.newTitle')}</h1>
        {product && <Badge tone={PRODUCT_TONES[product.status]}>{t(`seller.productStatus.${product.status}`)}</Badge>}
        {product?.status === 'published' && (
          <Button href={`/product/${product.slug}`} target="_blank" rel="noopener" size="sm" variant="outline" rightIcon={<ExternalLink className="size-4" />}>
            {t('seller.editor.viewLive')}
          </Button>
        )}
      </div>
      {product?.moderationNote && (product.status === 'rejected' || product.status === 'pending_review') && (
        <Alert tone={product.status === 'rejected' ? 'danger' : 'info'} title={t('seller.editor.moderation')} className="mb-4">
          {product.moderationNote}
        </Alert>
      )}
      {product?.status === 'pending_review' && !product.moderationNote && (
        <Alert tone="info" className="mb-4">
          {t('seller.editor.pendingReview')}
        </Alert>
      )}
      {!readOnly && publishPaused && <PublishPausedAlert className="mb-4" />}
      {formError && (
        <Alert tone="danger" className="mb-4">
          {formError}
        </Alert>
      )}

      <form className="grid gap-5" onSubmit={(e) => e.preventDefault()} noValidate>
        <fieldset disabled={readOnly} className="contents">
          <Section title={t('seller.editor.basics')}>
            <FormField label={t('seller.editor.title')} required hint={t('seller.editor.titleHint')}>
              <Input maxLength={150} {...register('title')} />
            </FormField>
            <FormField label={t('seller.editor.category')} required>
              <Controller control={control} name="categoryId" render={({ field }) => <CategoryPicker value={field.value} onChange={(cid) => field.onChange(cid)} />} />
            </FormField>
            <FormField label={t('seller.editor.brand')} hint={t('seller.common.optional')}>
              <Input maxLength={60} {...register('brandName')} />
            </FormField>
            <FormField label={t('seller.editor.highlights')} hint={t('seller.editor.highlightsHint')}>
              <Repeater
                rows={highlights.map((h) => ({ text: h }))}
                onChange={(rows) => setValue('highlights', rows.map((r) => r.text), { shouldDirty: true })}
                cols={[{ key: 'text', label: t('seller.editor.highlight') }]}
                blank={{ text: '' }}
                max={10}
                addLabel={t('seller.editor.addHighlight')}
              />
            </FormField>
            <FormField
              label={t('seller.editor.description')}
              labelAside={
                aiHelper ? (
                  <Button type="button" size="sm" variant="ghost" leftIcon={<Sparkles className="size-4" />} onClick={aiDraft}>
                    {t('seller.editor.aiHelper')}
                  </Button>
                ) : undefined
              }
            >
              <Controller control={control} name="description" render={({ field }) => <RichTextEditor value={field.value} onChange={field.onChange} />} />
            </FormField>
          </Section>

          <Section title={t('seller.editor.media')}>
            <Controller control={control} name="images" render={({ field }) => <ImagesField value={field.value} onChange={(v) => field.onChange(v)} />} />
            <Controller
              control={control}
              name="video"
              render={({ field }) => (
                <MediaUpload
                  label={t('seller.editor.video')}
                  hint={t('seller.editor.videoHint')}
                  endpoint="/seller/uploads"
                  accept="video/mp4,video/webm"
                  maxMb={30}
                  frameClassName="aspect-video max-w-sm"
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </Section>

          <Section title={t('seller.editor.attributes')} description={t('seller.editor.attributesHint')}>
            <Controller
              control={control}
              name="attributes"
              render={({ field }) => <AttributesFields categorySlug={categorySlug} value={field.value} onChange={field.onChange} />}
            />
          </Section>

          <Section title={t('seller.editor.variants')} description={t('seller.editor.variantsDesc')}>
            <OptionsVariants
              options={options}
              variants={variants}
              errors={variantErrors}
              onChange={(n) => {
                setValue('options', n.options, { shouldDirty: true });
                setValue('variants', n.variants, { shouldDirty: true });
              }}
            />
          </Section>

          <Section title={t('seller.editor.shipping')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('seller.editor.weight')}>
                <Input inputMode="numeric" dir="ltr" {...register('weightGrams')} />
              </FormField>
              <FormField label={t('seller.editor.processingDays')}>
                <Input inputMode="numeric" dir="ltr" {...register('processingDays')} />
              </FormField>
            </div>
            <Controller control={control} name="cod" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} label={t('seller.editor.cod')} />} />
            <Controller
              control={control}
              name="freeShipping"
              render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} label={t('seller.editor.freeShipping')} description={t('seller.editor.freeShippingHint')} />}
            />
            {preOrderFlag && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Controller control={control} name="preOrder" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} label={t('seller.editor.preOrder')} />} />
                {preOrder && (
                  <FormField label={t('seller.editor.shipsOn')}>
                    <Input type="date" {...register('preOrderShipsOn')} />
                  </FormField>
                )}
              </div>
            )}
          </Section>

          <Section title={t('seller.editor.afterSales')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('seller.editor.warranty')}>
                <Controller
                  control={control}
                  name="warrantyType"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      options={(['none', 'seller', 'brand'] as const).map((v) => ({ value: v, label: t(`seller.editor.warrantyTypes.${v}`) }))}
                    />
                  )}
                />
              </FormField>
              {warrantyType !== 'none' && (
                <FormField label={t('seller.editor.warrantyPeriod')}>
                  <Input maxLength={40} placeholder={t('seller.editor.warrantyPlaceholder')} {...register('warrantyPeriod')} />
                </FormField>
              )}
              <FormField label={t('seller.editor.returnDays')} hint={t('seller.editor.returnDaysHint')}>
                <Input inputMode="numeric" dir="ltr" {...register('returnDays')} />
              </FormField>
              <FormField label={t('seller.editor.returnNote')}>
                <Input maxLength={300} {...register('returnNote')} />
              </FormField>
            </div>
          </Section>

          <Section title={t('seller.editor.specs')}>
            <Repeater
              rows={specs}
              onChange={(rows) => setValue('specs', rows, { shouldDirty: true })}
              cols={[
                { key: 'label', label: t('seller.editor.specLabel') },
                { key: 'value', label: t('seller.editor.specValue') },
              ]}
              blank={{ label: '', value: '' }}
              max={40}
              addLabel={t('seller.editor.addSpec')}
            />
            <FormField label={t('seller.editor.sizeGuide')} hint={t('seller.editor.sizeGuideHint')}>
              <Textarea rows={4} maxLength={10000} {...register('sizeGuide')} />
            </FormField>
          </Section>

          {wholesaleFlag && (
            <Section title={t('seller.editor.wholesale')} description={t('seller.editor.wholesaleHint')}>
              <Repeater
                rows={wholesale}
                onChange={(rows) => setValue('wholesale', rows, { shouldDirty: true })}
                cols={[
                  { key: 'minQty', label: t('seller.editor.minQty'), inputMode: 'numeric' },
                  { key: 'price', label: t('seller.editor.unitPrice'), inputMode: 'decimal' },
                ]}
                blank={{ minQty: '', price: '' }}
                max={5}
                addLabel={t('seller.editor.addTier')}
              />
            </Section>
          )}
        </fieldset>

        {!readOnly && (
          <div className="sticky bottom-0 z-20 -mx-4 -mb-6 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:-mb-8 lg:px-8">
            <div className="mx-auto flex max-w-5xl items-center justify-end gap-2">
              {formState.isDirty && <span className="me-auto text-xs text-fg-muted">{t('seller.editor.unsaved')}</span>}
              <Button type="button" variant="outline" leftIcon={<Save className="size-4" />} loading={save.isPending && !action.isPending} disabled={busy} onClick={() => void submit(false)()}>
                {product && product.status !== 'draft' ? t('seller.common.save') : t('seller.editor.saveDraft')}
              </Button>
              {product?.status !== 'published' && publishPaused && <span className="text-xs text-danger">{t('billing.publishPaused.short')}</span>}
              {product?.status !== 'published' && (
                <Button type="button" leftIcon={<Send className="flip-rtl size-4" />} loading={busy} disabled={publishPaused} onClick={() => void submit(true)()}>
                  {t('seller.products.publish')}
                </Button>
              )}
            </div>
          </div>
        )}
      </form>
    </>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
