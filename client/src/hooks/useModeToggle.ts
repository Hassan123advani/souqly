import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { UserMode } from '@souqly/shared';
import { useSwitchMode } from '@/api/account';
import { getErrorCode, getErrorMessage } from '@/api/client';

/**
 * Buyer <-> Seller switch. On 409 NEEDS_STORE the user has no store yet,
 * so we send them to the Become-a-Seller intro instead of showing an error.
 */
export function useModeToggle() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const m = useSwitchMode();
  return {
    isPending: m.isPending,
    switchTo: (mode: UserMode) =>
      m.mutate(mode, {
        onSuccess: () => {
          toast.success(mode === 'seller' ? t('mode.nowSeller') : t('mode.nowBuyer'));
          navigate(mode === 'seller' ? '/seller' : '/');
        },
        onError: (err) => {
          if (getErrorCode(err) === 'NEEDS_STORE') navigate('/seller/onboarding');
          else toast.error(getErrorMessage(err));
        },
      }),
  };
}
