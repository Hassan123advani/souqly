import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ReportTarget } from '@souqly/shared';
import { getErrorCode } from '@/api/client';
import { socialError } from './errors';
import { useReport, type ReportReason } from '@/api/social';
import { Button, FormField, Modal, RadioGroup, Textarea } from '@/components/ui';

const REASONS: Record<ReportTarget, ReportReason[]> = {
  product: ['counterfeit', 'prohibited', 'misleading', 'offensive', 'spam', 'other'],
  store: ['fake', 'counterfeit', 'misleading', 'harassment', 'spam', 'other'],
  review: ['spam', 'offensive', 'fake', 'misleading', 'other'],
  message: ['harassment', 'spam', 'offensive', 'other'],
};

/** Reason + details dialog for reporting a product, store, review or chat message. */
export function ReportDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  targetType: ReportTarget;
  targetId: string;
}) {
  const { t } = useTranslation();
  const report = useReport();
  const [reason, setReason] = useState<ReportReason>(REASONS[targetType][0]!);
  const [details, setDetails] = useState('');

  const submit = () =>
    report.mutate(
      { targetType, targetId, reason, ...(details.trim() ? { details: details.trim() } : {}) },
      {
        onSuccess: () => {
          toast.success(t('social.report.sent'));
          onOpenChange(false);
          setDetails('');
        },
        onError: (e) => {
          const code = getErrorCode(e);
          if (code === 'ALREADY_REPORTED' || code === 'CONFLICT') {
            toast.info(t('social.report.already'));
            onOpenChange(false);
          } else toast.error(socialError(e));
        },
      },
    );

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t(`social.report.title.${targetType}`)}
      description={t('social.report.description')}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" loading={report.isPending} onClick={submit}>
            {t('social.report.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <RadioGroup
          value={reason}
          onChange={(v) => setReason(v as ReportReason)}
          options={REASONS[targetType].map((r) => ({ value: r, label: t(`social.report.reasons.${r}`) }))}
        />
        <FormField label={t('social.report.details')} hint={t('social.report.detailsHint')}>
          <Textarea value={details} maxLength={1000} rows={3} onChange={(e) => setDetails(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}
