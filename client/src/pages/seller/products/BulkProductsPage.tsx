import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CheckCircle2, Download, FileSpreadsheet, FileUp, Upload } from 'lucide-react';
import { PERMISSIONS } from '@souqly/shared';
import { getErrorMessage } from '@/api/client';
import { useImportProducts, useStoreDownload, type ImportResult } from '@/api/growth';
import { Seo } from '@/components/layout/Seo';
import { Alert, Badge, Breadcrumbs, Button, Card, CardHeader, SectionHeader, Skeleton } from '@/components/ui';
import { StorePermGate, UpgradeCard, isPlanLimit, usePlanFeature } from '@/components/seller/growth/gates';

const MAX_BYTES = 2 * 1024 * 1024;

export default function BulkProductsPage() {
  const { t } = useTranslation();
  return (
    <>
      <Seo title={t('growth.bulk.title')} noindex />
      <Breadcrumbs className="mb-3" items={[{ label: t('seller.nav.products'), to: '/seller/products' }, { label: t('growth.bulk.title') }]} />
      <SectionHeader as="h1" title={t('growth.bulk.title')} description={t('growth.bulk.subtitle')} />
      <StorePermGate perm={PERMISSIONS.STORE_PRODUCTS_MANAGE}>
        <BulkView />
      </StorePermGate>
    </>
  );
}

function BulkView() {
  const { t } = useTranslation();
  const dl = useStoreDownload();
  const canImport = usePlanFeature('bulkUpload');
  const download = (kind: 'template' | 'export') =>
    dl.mutate(
      kind === 'template'
        ? { url: '/seller/products/import-template.csv', filename: 'souqly-products-template.csv' }
        : { url: '/seller/products/export.csv', filename: 'products.csv' },
      { onError: (e) => toast.error(getErrorMessage(e)) },
    );
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader title={t('growth.bulk.stepsTitle')} />
        <div className="grid gap-4 p-4 text-sm">
          <ol className="grid list-decimal gap-2 ps-5 text-fg-muted">
            <li>{t('growth.bulk.step1')}</li>
            <li>{t('growth.bulk.step2')}</li>
            <li>{t('growth.bulk.step3')}</li>
            <li>{t('growth.bulk.step4')}</li>
          </ol>
          <div className="grid gap-2">
            <Button
              variant="outline"
              leftIcon={<FileSpreadsheet className="size-4" />}
              loading={dl.isPending && dl.variables?.url.includes('template')}
              onClick={() => download('template')}
            >
              {t('growth.bulk.template')}
            </Button>
            <Button
              variant="outline"
              leftIcon={<Download className="size-4" />}
              loading={dl.isPending && dl.variables?.url.includes('export')}
              onClick={() => download('export')}
            >
              {t('growth.bulk.export')}
            </Button>
          </div>
          <p className="text-xs text-fg-muted">{t('growth.bulk.rules')}</p>
        </div>
      </Card>
      <div className="lg:col-span-2">
        {canImport === undefined ? <Skeleton className="h-64" /> : canImport ? <ImportCard /> : <UpgradeCard feature="bulkUpload" />}
      </div>
    </div>
  );
}

function ImportCard() {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [planLocked, setPlanLocked] = useState(false);
  const imp = useImportProducts();

  const pick = (f: File | undefined) => {
    setResult(null);
    if (!f) return setFile(null);
    if (!/\.csv$/i.test(f.name)) return void toast.error(t('growth.bulk.notCsv'));
    if (f.size > MAX_BYTES) return void toast.error(t('growth.bulk.tooLarge'));
    setFile(f);
  };

  const run = (dryRun: boolean) => {
    if (!file) return;
    imp.mutate(
      { file, dryRun },
      {
        onSuccess: (r) => {
          setResult(r);
          if (r.errors.length) toast.error(t('growth.bulk.hasErrors', { count: r.errors.length }));
          else if (r.dryRun) toast.success(t('growth.bulk.validOk'));
          else toast.success(t('growth.bulk.imported', { created: r.created, updated: r.updated }));
        },
        onError: (e) => {
          if (isPlanLimit(e)) setPlanLocked(true);
          toast.error(getErrorMessage(e));
        },
      },
    );
  };

  if (planLocked) return <UpgradeCard feature="bulkUpload" />;
  const validated = result?.dryRun && !result.errors.length;
  return (
    <Card>
      <CardHeader title={t('growth.bulk.importTitle')} description={t('growth.bulk.importHint')} />
      <div className="grid gap-4 p-4">
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pick(e.dataTransfer.files[0]);
          }}
          className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border-strong p-8 text-center hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          <FileUp className="size-8 text-primary-700" />
          <span className="text-sm font-semibold text-fg">{file ? file.name : t('growth.bulk.drop')}</span>
          <span className="text-xs text-fg-muted">{t('growth.bulk.limits')}</span>
        </button>
        <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} onChange={(e) => pick(e.target.files?.[0])} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!file} loading={imp.isPending && imp.variables?.dryRun} onClick={() => run(true)}>
            {t('growth.bulk.validate')}
          </Button>
          <Button leftIcon={<Upload className="size-4" />} disabled={!file || !validated} loading={imp.isPending && imp.variables?.dryRun === false} onClick={() => run(false)}>
            {t('growth.bulk.import')}
          </Button>
        </div>
        {!validated && file && !result && <p className="text-xs text-fg-muted">{t('growth.bulk.validateFirst')}</p>}
        {result && <ImportReport result={result} />}
      </div>
    </Card>
  );
}

function ImportReport({ result: r }: { result: ImportResult }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-3">
      {r.errors.length ? (
        <Alert tone="danger" title={t('growth.bulk.errorsTitle', { count: r.errors.length, rows: r.rows })}>
          {t('growth.bulk.errorsBody')}
        </Alert>
      ) : (
        <Alert tone="success" title={r.dryRun ? t('growth.bulk.validOk') : t('growth.bulk.done')}>
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="size-4" />
            {t('growth.bulk.summary', { rows: r.rows, created: r.created, updated: r.updated, products: r.productsCreated })}
          </span>
        </Alert>
      )}
      {r.errors.length > 0 && (
        <div className="max-h-96 overflow-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-2 text-xs text-fg-muted">
              <tr>
                <th className="px-3 py-2 text-start font-semibold">{t('growth.bulk.row')}</th>
                <th className="px-3 py-2 text-start font-semibold">{t('growth.bulk.field')}</th>
                <th className="px-3 py-2 text-start font-semibold">{t('growth.bulk.problem')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {r.errors.map((e, i) => (
                <tr key={`${e.row}-${e.field ?? ''}-${i}`}>
                  <td className="px-3 py-2 font-semibold">{e.row}</td>
                  <td className="px-3 py-2">
                    {e.field && (
                      <Badge size="sm" className="font-mono" dir="ltr">
                        {e.field}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-fg-muted">{t(`growth.bulk.codes.${e.code}`, { defaultValue: e.message })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
