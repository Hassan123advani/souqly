import { useTranslation } from 'react-i18next';
import { Alert, Button } from '@/components/ui';

/** Explains why publishing is disabled while the store is suspended for billing. */
export function PublishPausedAlert({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <Alert
      tone="warning"
      className={className}
      title={t('billing.publishPaused.title')}
      action={
        <Button to="/seller/billing" size="sm" variant="outline" className="shrink-0 self-center">
          {t('billing.publishPaused.cta')}
        </Button>
      }
    >
      {t('billing.publishPaused.body')}
    </Alert>
  );
}
