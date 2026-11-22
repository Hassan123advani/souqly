import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Download, Store, Trash2 } from 'lucide-react';
import { useDeleteAccount, useExportData } from '@/api/account';
import { getErrorCode, getErrorMessage } from '@/api/client';
import { Seo } from '@/components/layout/Seo';
import { Alert, Button, Card, CardBody, CardFooter, CardHeader, FormField, Input, Modal, PasswordInput } from '@/components/ui';

export default function PrivacyDataPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const exp = useExportData();
  const del = useDeleteAccount();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const ownsStore = getErrorCode(del.error) === 'OWNS_STORE';

  const close = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setPassword('');
      setConfirm('');
      del.reset();
    }
  };

  return (
    <>
      <Seo title={t('account.nav.privacy')} noindex />
      <Card>
        <CardHeader title={t('dataPage.export.title')} description={t('dataPage.export.subtitle')} />
        <CardBody>
          <ul className="grid gap-2 text-sm text-fg-muted sm:grid-cols-2">
            {(t('dataPage.export.items', { returnObjects: true }) as string[]).map((i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-accent" />
                {i}
              </li>
            ))}
          </ul>
        </CardBody>
        <CardFooter>
          <Button
            variant="outline"
            loading={exp.isPending}
            leftIcon={<Download className="size-4" />}
            onClick={() =>
              exp.mutate(undefined, {
                onSuccess: () => toast.success(t('dataPage.export.done')),
                onError: (e) => toast.error(getErrorMessage(e)),
              })
            }
          >
            {t('dataPage.export.cta')}
          </Button>
        </CardFooter>
      </Card>

      <Card className="border-danger/30">
        <CardHeader title={<span className="text-danger">{t('dataPage.delete.title')}</span>} description={t('dataPage.delete.subtitle')} />
        <CardBody>
          <ul className="space-y-1.5 text-sm text-fg-muted">
            {(t('dataPage.delete.consequences', { returnObjects: true }) as string[]).map((i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-danger" />
                {i}
              </li>
            ))}
          </ul>
        </CardBody>
        <CardFooter>
          <Button variant="danger" leftIcon={<Trash2 className="size-4" />} onClick={() => setOpen(true)}>
            {t('dataPage.delete.cta')}
          </Button>
        </CardFooter>
      </Card>

      <Modal
        open={open}
        onOpenChange={close}
        title={t('dataPage.delete.modalTitle')}
        description={t('dataPage.delete.modalBody')}
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={del.isPending}
              disabled={confirm !== 'DELETE' || !password}
              onClick={() =>
                del.mutate(password, {
                  onSuccess: () => {
                    toast.success(t('dataPage.delete.done'));
                    navigate('/', { replace: true });
                  },
                  onError: (e) => {
                    if (getErrorCode(e) !== 'OWNS_STORE') toast.error(getErrorMessage(e));
                  },
                })
              }
            >
              {t('dataPage.delete.confirmCta')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {ownsStore && (
            <Alert
              tone="warning"
              title={t('dataPage.delete.ownsStoreTitle')}
              action={
                <Button size="sm" variant="outline" to="/seller" leftIcon={<Store className="size-4" />}>
                  {t('nav.sellerCenter')}
                </Button>
              }
            >
              {t('errors.OWNS_STORE')}
            </Alert>
          )}
          <FormField label={t('form.currentPassword')} required>
            <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </FormField>
          <FormField label={t('dataPage.delete.typeLabel')} hint={t('dataPage.delete.typeHint')} required>
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="latin font-mono tracking-widest"
              dir="ltr"
              placeholder="DELETE"
            />
          </FormField>
        </div>
      </Modal>
    </>
  );
}
