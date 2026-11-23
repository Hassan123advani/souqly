import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Eye } from 'lucide-react';
import { useMe } from '@/api/auth';
import { useStopImpersonation } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { Button } from '@/components/ui';

/** Persistent app-wide bar while a staff member is viewing Souqly as another user. */
export function ImpersonationBanner() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const stop = useStopImpersonation();
  if (!me?.impersonatedBy) return null;
  return (
    <div role="status" className="sticky top-0 z-[60] border-b border-accent-600 bg-ink-900 text-ink-50 dark:bg-ink-50 dark:text-ink-900">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
        <span className="grid size-7 place-items-center rounded-full bg-accent text-ink-900">
          <Eye className="size-4" />
        </span>
        <p className="min-w-0 flex-1 font-semibold">{t('admin.impersonation.banner', { name: me.name })}</p>
        <Button size="sm" variant="accent" loading={stop.isPending} onClick={() => stop.mutate(undefined, { onError: (e) => toast.error(getErrorMessage(e)) })}>
          {t('admin.impersonation.stop')}
        </Button>
      </div>
    </div>
  );
}
