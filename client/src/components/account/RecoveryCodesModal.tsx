import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Copy, Download } from 'lucide-react';
import { Alert, Button, Checkbox, Modal } from '@/components/ui';

/** Shows freshly issued 2FA recovery codes once. Cannot be dismissed until the user confirms saving them. */
export function RecoveryCodesModal({ codes, onClose }: { codes: string[] | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [saved, setSaved] = useState(false);
  const text = (codes ?? []).join('\n');

  const close = () => {
    if (!saved) return;
    setSaved(false);
    onClose();
  };

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('common.copied'));
    } catch {
      toast.error(t('errors.GENERIC'));
    }
  };

  const download = () => {
    const blob = new Blob([`${t('security.recovery.fileHeader')}\n\n${text}\n`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'souqly-recovery-codes.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Modal
      open={!!codes}
      onOpenChange={(o) => !o && close()}
      hideClose
      title={t('security.recovery.title')}
      description={t('security.recovery.body')}
      footer={
        <Button disabled={!saved} onClick={close}>
          {t('security.recovery.done')}
        </Button>
      }
    >
      <div className="space-y-4">
        <Alert tone="warning">{t('security.recovery.once')}</Alert>
        <ul className="grid grid-cols-2 gap-2 rounded-lg border border-dashed border-border-strong bg-surface-2/60 p-4" dir="ltr">
          {(codes ?? []).map((c) => (
            <li key={c} className="latin text-center font-mono text-sm font-semibold tracking-wider text-fg">
              {c}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" leftIcon={<Copy className="size-4" />} onClick={copyAll}>
            {t('security.recovery.copyAll')}
          </Button>
          <Button size="sm" variant="outline" leftIcon={<Download className="size-4" />} onClick={download}>
            {t('security.recovery.download')}
          </Button>
        </div>
        <Checkbox checked={saved} onChange={(e) => setSaved(e.target.checked)} label={t('security.recovery.confirm')} />
      </div>
    </Modal>
  );
}
