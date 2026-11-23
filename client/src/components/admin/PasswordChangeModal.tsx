import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMe } from '@/api/auth';
import { ChangePasswordCard } from '@/components/account/SecurityCards';
import { Modal } from '@/components/ui';

/** First-login prompt for staff still on a default/temporary password. Closes itself once changed. */
export function PasswordChangeModal() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const [later, setLater] = useState(false);
  const open = !!me?.passwordChangeRecommended && !me.impersonatedBy && !later;
  return (
    <Modal open={open} onOpenChange={(o) => !o && setLater(true)} title={t('admin.pwModal.title')} description={t('admin.pwModal.body')} size="lg">
      <div className="-mx-1 [&>div]:border-0 [&>div]:shadow-none">
        <ChangePasswordCard />
      </div>
    </Modal>
  );
}
