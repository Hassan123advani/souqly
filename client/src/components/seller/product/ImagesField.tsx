import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, ImagePlus, Star, Trash2 } from 'lucide-react';
import { getErrorMessage } from '@/api/client';
import { uploadFile } from '@/api/seller';
import { Input, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useActiveStoreId } from '../useActiveStore';
import type { ImageRow } from './model';

const MAX = 10;

/** Product gallery: drag & drop upload, drag (or arrow) reorder, alt text. First image is the cover. */
export function ImagesField({ value, onChange }: { value: ImageRow[]; onChange: (v: ImageRow[]) => void }) {
  const { t } = useTranslation();
  const sid = useActiveStoreId();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const latest = useRef(value);
  latest.current = value;

  async function upload(files: FileList | File[]) {
    const list = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .slice(0, MAX - latest.current.length);
    if (!list.length) return;
    setUploading((n) => n + list.length);
    for (const f of list) {
      try {
        const r = await uploadFile('/seller/uploads', f, sid);
        const next = [...latest.current, { url: r.url, key: r.key, alt: '' }];
        latest.current = next;
        onChange(next);
      } catch (e) {
        toast.error(getErrorMessage(e));
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (input.current) input.current.value = '';
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length || from === to) return;
    const next = [...value];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it!);
    onChange(next);
  };

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {value.map((img, i) => (
          <div
            key={img.key}
            draggable
            onDragStart={() => setDragIdx(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIdx !== null) move(dragIdx, i);
              setDragIdx(null);
            }}
            className={cn('group grid gap-1.5 rounded-md border border-border bg-surface p-1.5', dragIdx === i && 'opacity-50')}
          >
            <div className="relative aspect-square cursor-grab overflow-hidden rounded bg-surface-2">
              <img src={img.url} alt={img.alt} className="size-full object-cover" />
              {i === 0 && (
                <span className="absolute start-1 top-1 inline-flex items-center gap-1 rounded-pill bg-accent px-2 py-0.5 text-[10px] font-bold text-ink-900">
                  <Star className="size-3" /> {t('seller.editor.cover')}
                </span>
              )}
              <div className="absolute inset-x-1 bottom-1 flex justify-between opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                <span className="flex gap-1">
                  <button type="button" aria-label={t('seller.editor.moveBack')} onClick={() => move(i, i - 1)} className="grid size-7 place-items-center rounded bg-surface/90 text-fg shadow">
                    <ArrowLeft className="flip-rtl size-3.5" />
                  </button>
                  <button type="button" aria-label={t('seller.editor.moveForward')} onClick={() => move(i, i + 1)} className="grid size-7 place-items-center rounded bg-surface/90 text-fg shadow">
                    <ArrowRight className="flip-rtl size-3.5" />
                  </button>
                </span>
                <button
                  type="button"
                  aria-label={t('seller.upload.remove')}
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                  className="grid size-7 place-items-center rounded bg-surface/90 text-danger shadow"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
            <Input
              value={img.alt}
              maxLength={150}
              onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))}
              placeholder={t('seller.editor.alt')}
              aria-label={t('seller.editor.alt')}
              className="h-8 text-xs"
            />
          </div>
        ))}
        {value.length + uploading < MAX && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
            }}
            className={cn(
              'flex aspect-square flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed p-2 text-center text-xs text-fg-muted hover:border-primary-400 hover:text-fg',
              over ? 'border-primary bg-primary-50' : 'border-border',
            )}
          >
            {uploading ? <Spinner /> : <ImagePlus className="size-6" />}
            <span className="font-semibold">{t('seller.editor.addImages')}</span>
            <span>{t('seller.upload.drop')}</span>
          </button>
        )}
      </div>
      <p className="text-xs text-fg-muted">{t('seller.editor.imagesHint', { max: MAX })}</p>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple hidden onChange={(e) => e.target.files && void upload(e.target.files)} />
    </div>
  );
}
