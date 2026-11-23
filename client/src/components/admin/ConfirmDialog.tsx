import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FormField, Modal, Textarea } from '@/components/ui';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  /** Shows a reason/note field; `reasonRequired` enforces 3+ characters (server rule). */
  reasonLabel?: string;
  reasonRequired?: boolean;
  reasonMin?: number;
  loading?: boolean;
  onConfirm: (reason: string) => void;
  children?: ReactNode;
};

/** Confirmation for destructive / sensitive admin actions, optionally collecting a reason. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, tone = 'primary', reasonLabel, reasonRequired, reasonMin = 3, loading, onConfirm, children }: Props) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  const invalid = reasonRequired && reason.trim().length < reasonMin;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={loading} disabled={invalid} onClick={() => onConfirm(reason.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {reasonLabel && (
        <FormField label={reasonLabel} required={reasonRequired} hint={reasonRequired ? t('admin.common.reasonHint', { count: reasonMin }) : undefined} className={children ? 'mt-4' : undefined}>
          <Textarea rows={3} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} autoFocus />
        </FormField>
      )}
    </Modal>
  );
}
