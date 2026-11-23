import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FileText, ImagePlus, Trash2, UploadCloud } from 'lucide-react';
import { getErrorMessage } from '@/api/client';
import { uploadFile } from '@/api/seller';
import { Button, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useActiveStoreId } from './useActiveStore';

export type MediaRef = { url: string; key: string };

/** Single-file upload with preview. Images are shown "contain"-fit (no cropping). */
export function MediaUpload({
  value,
  onChange,
  endpoint = '/uploads/temp',
  accept = 'image/jpeg,image/png,image/webp,image/avif',
  label,
  hint,
  className,
  frameClassName = 'aspect-square',
  disabled,
  maxMb = 5,
}: {
  value?: MediaRef | null;
  onChange: (v: MediaRef | null) => void;
  endpoint?: '/uploads/temp' | '/seller/uploads';
  accept?: string;
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
  frameClassName?: string;
  disabled?: boolean;
  maxMb?: number;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const sid = useActiveStoreId();
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const isPdf = !!value?.url && /\.pdf($|\?)/i.test(value.url);
  const isVideo = !!value?.url && /\.(mp4|webm|mov)($|\?)/i.test(value.url);

  async function handle(file: File | undefined) {
    if (!file) return;
    if (file.size > maxMb * 1024 * 1024) {
      toast.error(t('seller.upload.tooBig', { mb: maxMb }));
      return;
    }
    setBusy(true);
    try {
      const res = await uploadFile(endpoint, file, sid);
      onChange({ url: res.url, key: res.key });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <p className="text-sm font-semibold text-fg">{label}</p>
      <div
        className={cn(
          'relative grid place-items-center overflow-hidden rounded-lg border-2 border-dashed bg-surface-2 transition-colors',
          dragOver ? 'border-primary bg-primary-50' : 'border-border',
          frameClassName,
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled) void handle(e.dataTransfer.files[0]);
        }}
      >
        {isVideo && <video src={value!.url} controls className="absolute inset-0 size-full bg-black object-contain" />}
        {value?.url && !isPdf && !isVideo && <img src={value.url} alt="" className="absolute inset-0 size-full object-contain p-2" />}
        {value?.url && isPdf && (
          <span className="flex flex-col items-center gap-1 text-sm text-fg-muted">
            <FileText className="size-8" /> {t('seller.upload.pdfReady')}
          </span>
        )}
        {!value?.url && (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => input.current?.click()}
            className="flex size-full flex-col items-center justify-center gap-1.5 p-4 text-center text-sm text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >
            {accept.includes('pdf') ? <UploadCloud className="size-7" /> : <ImagePlus className="size-7" />}
            <span className="font-semibold">{t('seller.upload.choose')}</span>
            <span className="text-xs">{t('seller.upload.drop')}</span>
          </button>
        )}
        {busy && (
          <span className="absolute inset-0 grid place-items-center bg-surface/70">
            <Spinner label={t('seller.upload.uploading')} />
          </span>
        )}
      </div>
      {value?.url && (
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => input.current?.click()} disabled={disabled || busy}>
            {t('seller.upload.replace')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            leftIcon={<Trash2 className="size-4" />}
            onClick={() => onChange(null)}
            disabled={disabled || busy}
          >
            {t('seller.upload.remove')}
          </Button>
        </div>
      )}
      {hint && <p className="text-xs text-fg-muted">{hint}</p>}
      <input ref={input} type="file" accept={accept} hidden onChange={(e) => void handle(e.target.files?.[0])} />
    </div>
  );
}
