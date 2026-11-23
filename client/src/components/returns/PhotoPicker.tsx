import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Camera, ImagePlus, X } from 'lucide-react';
import { uploadImage, type UploadedImage } from '@/api/delivery';
import { getErrorMessage } from '@/api/client';
import { Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Uploads images one by one to `endpoint` (returns sealed `{key,url,ref}`) and reports the list.
 * `capture` opens the rear camera directly on phones (rider proof of delivery).
 */
export function PhotoPicker({
  endpoint,
  value,
  onChange,
  max,
  capture,
  className,
}: {
  endpoint: string;
  value: UploadedImage[];
  onChange: (v: UploadedImage[]) => void;
  max: number;
  capture?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    const room = max - value.length;
    const list = Array.from(files).slice(0, room);
    if (files.length > room) toast.error(t('returns.form.photoLimit', { max }));
    let next = value;
    for (const f of list) {
      if (!f.type.startsWith('image/')) {
        toast.error(t('returns.form.photoType'));
        continue;
      }
      if (f.size > MAX_BYTES) {
        toast.error(t('returns.form.photoSize'));
        continue;
      }
      setBusy((n) => n + 1);
      try {
        const img = await uploadImage(endpoint, f);
        next = [...next, img];
        onChange(next);
      } catch (e) {
        toast.error(getErrorMessage(e));
      } finally {
        setBusy((n) => n - 1);
      }
    }
    if (input.current) input.current.value = '';
  }

  const Icon = capture ? Camera : ImagePlus;
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {value.map((img) => (
        <div key={img.key} className="relative size-20 overflow-hidden rounded-md border border-border bg-surface-2">
          <img src={img.url} alt="" className="size-full object-cover" />
          <button
            type="button"
            aria-label={t('returns.form.removePhoto')}
            onClick={() => onChange(value.filter((v) => v.key !== img.key))}
            className="absolute end-1 top-1 grid size-6 place-items-center rounded-pill bg-black/60 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      {Array.from({ length: busy }, (_, i) => (
        <div key={`b${i}`} className="grid size-20 place-items-center rounded-md border border-dashed border-border bg-surface-2">
          <Spinner className="size-5" />
        </div>
      ))}
      {value.length + busy < max && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="grid size-20 place-items-center rounded-md border-2 border-dashed border-border-strong text-fg-muted transition-colors hover:border-primary hover:text-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span className="flex flex-col items-center gap-1 text-[11px] font-semibold">
            <Icon className="size-5" aria-hidden />
            {capture ? t('returns.form.takePhoto') : t('returns.form.addPhoto')}
          </span>
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple={!capture}
        {...(capture ? { capture: 'environment' as const } : {})}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => void pick(e.target.files)}
      />
    </div>
  );
}
