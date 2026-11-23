import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { StoreUpdateInput } from '@souqly/shared';
import { getErrorCode, getErrorDetails, getErrorMessage } from '@/api/client';
import { useUpdateStore } from '@/api/seller';
import { formatDate } from '@/lib/format';
import { useLang } from '@/lib/catalog';

/** PATCH /seller/store with toasts (incl. the 30-day slug rule). */
export function useStorePatch() {
  const { t } = useTranslation();
  const lang = useLang();
  const m = useUpdateStore();
  return {
    isPending: m.isPending,
    save: (body: StoreUpdateInput, onDone?: () => void) =>
      m.mutate(body, {
        onSuccess: () => {
          toast.success(t('seller.common.saved'));
          onDone?.();
        },
        onError: (e) => {
          if (getErrorCode(e) === 'SLUG_CHANGE_TOO_SOON') {
            const at = getErrorDetails(e)?.nextChangeAt;
            toast.error(t('seller.storeSettings.slugTooSoon', { date: typeof at === 'string' ? formatDate(at, lang) : '' }));
          } else toast.error(getErrorMessage(e));
        },
      }),
  };
}
