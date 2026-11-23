import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import { downloadCsv } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { Button } from '@/components/ui';

/** Exports the current filtered list as CSV (`?format=csv`). */
export function CsvButton({ path, params, filename }: { path: string; params?: Record<string, string | number | boolean | undefined>; filename?: string }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      await downloadCsv(path, params, filename);
      toast.success(t('admin.common.exported'));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="outline" size="sm" loading={busy} leftIcon={<Download className="size-4" />} onClick={() => void run()}>
      {t('admin.common.exportCsv')}
    </Button>
  );
}
