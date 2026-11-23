import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ImagePlus, Star, Video, X } from 'lucide-react';
import { reviewCreateSchema, type PendingReviewDTO } from '@souqly/shared';
import { uploadSocial, useCreateReview } from '@/api/social';
import { socialError } from '@/components/social/errors';
import { Button, FormField, IconButton, Input, Modal, Spinner, Textarea } from '@/components/ui';
import { ProductImage } from '@/components/product/ProductImage';
import { cn } from '@/lib/cn';

const formSchema = reviewCreateSchema.pick({ rating: true, title: true, body: true });
type FormValues = { rating: number; title?: string; body?: string };
type Uploaded = { key: string; url: string; type: 'image' | 'video' };

const IMAGE_RE = /^image\/(jpeg|png|webp|avif)$/;
const VIDEO_RE = /^video\/(mp4|webm)$/;

export function StarPicker({ value, onChange, error }: { value: number; onChange: (n: number) => void; error?: boolean }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-3">
      <div role="radiogroup" aria-label={t('reviews.write.rating')} className="flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={t('reviews.starsN', { n })}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(n)}
            className="rounded-sm p-0.5 transition-transform hover:scale-110 motion-reduce:hover:scale-100"
          >
            <Star className={cn('size-8', n <= shown ? 'fill-accent text-accent' : error ? 'text-danger/60' : 'text-ink-300')} />
          </button>
        ))}
      </div>
      {shown > 0 && <span className="text-sm font-semibold text-fg-muted">{t(`reviews.write.label${shown}`)}</span>}
    </div>
  );
}

/** Review form for one delivered order item (≤ 5 photos + 1 video). */
export function WriteReviewModal({ item, onClose }: { item: PendingReviewDTO; onClose: () => void }) {
  const { t } = useTranslation();
  const create = useCreateReview();
  const [media, setMedia] = useState<Uploaded[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { rating: 0, title: '', body: '' } });
  const photos = media.filter((m) => m.type === 'image').length;
  const videos = media.filter((m) => m.type === 'video').length;

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    let p = photos;
    let v = videos;
    for (const file of Array.from(files)) {
      const isImg = IMAGE_RE.test(file.type);
      const isVid = VIDEO_RE.test(file.type);
      if (!isImg && !isVid) {
        toast.error(t('reviews.write.badType'));
        continue;
      }
      if ((isImg && p >= 5) || (isVid && v >= 1)) {
        toast.error(t('reviews.write.limit'));
        continue;
      }
      if (file.size > (isImg ? 5 : 30) * 1024 * 1024) {
        toast.error(t(isImg ? 'reviews.write.imageTooBig' : 'reviews.write.videoTooBig'));
        continue;
      }
      isImg ? p++ : v++;
      setBusy(0);
      try {
        const up = await uploadSocial(file, isImg ? 'review_image' : 'review_video', setBusy);
        setMedia((m) => [...m, { key: up.key, url: up.url, type: isImg ? 'image' : 'video' }]);
      } catch (e) {
        isImg ? p-- : v--;
        toast.error(socialError(e));
      }
    }
    setBusy(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const submit = form.handleSubmit((v) =>
    create.mutate(
      {
        orderId: item.orderId,
        productId: item.productId,
        variantId: item.variantId,
        rating: v.rating,
        ...(v.title?.trim() ? { title: v.title.trim() } : {}),
        ...(v.body?.trim() ? { body: v.body.trim() } : {}),
        ...(media.length ? { media: media.map((m) => ({ key: m.key, type: m.type })) } : {}),
      },
      {
        onSuccess: (r) => {
          if (r?.status === 'pending') toast.warning(t('reviews.write.moderated'), { duration: 8000 });
          else toast.success(t('reviews.write.thanks'));
          onClose();
        },
        onError: (e) => toast.error(socialError(e)),
      },
    ),
  );

  const options = Object.values(item.options ?? {}).join(' · ');
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('reviews.write.title')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()} loading={create.isPending} disabled={busy !== null}>
            {t('reviews.write.submit')}
          </Button>
        </>
      }
    >
      <form className="space-y-5" onSubmit={(e) => void submit(e)} noValidate>
        <div className="flex items-center gap-3 rounded-md bg-surface-2/60 p-3">
          <ProductImage src={item.image ?? ''} alt="" className="size-14 shrink-0 rounded-sm" />
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm font-semibold text-fg">{item.title}</p>
            {options && <p className="text-xs text-fg-muted">{options}</p>}
          </div>
        </div>

        <FormField label={t('reviews.write.rating')} required error={form.formState.errors.rating ? t('reviews.write.ratingRequired') : undefined}>
          <Controller
            control={form.control}
            name="rating"
            render={({ field, fieldState }) => <StarPicker value={field.value} onChange={field.onChange} error={!!fieldState.error} />}
          />
        </FormField>
        <FormField label={t('reviews.write.headline')} error={form.formState.errors.title?.message}>
          <Input maxLength={120} placeholder={t('reviews.write.headlinePh')} {...form.register('title')} />
        </FormField>
        <FormField label={t('reviews.write.body')} hint={t('reviews.write.bodyHint')} error={form.formState.errors.body?.message}>
          <Textarea rows={4} maxLength={3000} placeholder={t('reviews.write.bodyPh')} {...form.register('body')} />
        </FormField>

        <div>
          <p className="text-sm font-semibold text-fg">{t('reviews.write.media')}</p>
          <p className="text-xs text-fg-muted">{t('reviews.write.mediaHint')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {media.map((m) => (
              <div key={m.key} className="relative size-20 overflow-hidden rounded-md border border-border bg-surface-2">
                {m.type === 'video' ? <video src={m.url} muted className="size-full object-cover" /> : <img src={m.url} alt="" className="size-full object-cover" />}
                {m.type === 'video' && <Video className="absolute bottom-1 start-1 size-4 text-white drop-shadow" aria-hidden />}
                <IconButton
                  label={t('reviews.write.removeMedia')}
                  size="sm"
                  variant="ghost"
                  onClick={() => setMedia((x) => x.filter((y) => y.key !== m.key))}
                  className="absolute end-0.5 top-0.5 size-7 bg-surface/90"
                >
                  <X className="size-3.5" />
                </IconButton>
              </div>
            ))}
            {(photos < 5 || videos < 1) && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => fileRef.current?.click()}
                className="grid size-20 place-items-center rounded-md border-2 border-dashed border-border-strong text-fg-muted hover:border-primary hover:text-primary-700"
              >
                {busy !== null ? (
                  <span className="flex flex-col items-center gap-1 text-[11px]">
                    <Spinner className="size-4" />
                    {busy}%
                  </span>
                ) : (
                  <span className="flex flex-col items-center gap-1 text-[11px] font-semibold">
                    <ImagePlus className="size-5" aria-hidden />
                    {t('reviews.write.add')}
                  </span>
                )}
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm"
            className="hidden"
            onChange={(e) => void onFiles(e.target.files)}
          />
        </div>
      </form>
    </Modal>
  );
}
