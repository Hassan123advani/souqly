import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ImageUp, X } from 'lucide-react';
import { PERMISSIONS } from '@souqly/shared';
import { useCmsUpload } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { Button, IconButton, Input } from '@/components/ui';
import { useAdminCan } from './useAdminCan';

/** URL field + upload button (POST /admin/cms/uploads) with a thumbnail preview. */
export function ImageUpload({ value, onChange, label }: { value: string; onChange: (url: string) => void; label: string }) {
  const { t } = useTranslation();
  const can = useAdminCan();
  const upload = useCmsUpload();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2">
      <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-surface-2">
        {value ? <img src={value} alt="" className="size-full object-cover" /> : <ImageUp className="size-4 text-fg-subtle" />}
      </span>
      <Input dir="ltr" value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://… or /uploads/…" aria-label={label} className="min-w-0 flex-1" />
      {value && (
        <IconButton size="sm" variant="ghost" label={t('admin.common.remove')} onClick={() => onChange('')}>
          <X className="size-4" />
        </IconButton>
      )}
      {can(PERMISSIONS.ADMIN_CMS_MANAGE) && (
        <>
          <input
            ref={ref}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              if (file.size > 5 * 1024 * 1024) return void toast.error(t('admin.common.tooLarge'));
              upload.mutate(file, { onSuccess: (r) => onChange(r.url), onError: (err) => toast.error(getErrorMessage(err)) });
            }}
          />
          <Button type="button" variant="outline" size="sm" loading={upload.isPending} onClick={() => ref.current?.click()}>
            {t('admin.common.upload')}
          </Button>
        </>
      )}
    </div>
  );
}
