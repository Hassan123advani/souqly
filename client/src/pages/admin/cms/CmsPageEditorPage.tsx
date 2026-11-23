import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Save, Trash2 } from 'lucide-react';
import { adminPageSchema, adminPageUpdateSchema, type LocalizedName } from '@souqly/shared';
import { useAdminGet, useAdminMutation, type CmsPage } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { PageHeader } from '@/components/admin/PageHeader';
import { RichTextEditor } from '@/components/seller/product/RichTextEditor';
import { Alert, Button, Card, ErrorState, FormField, Input, Skeleton, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';

const LANGS = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ur', label: 'اردو', dir: 'rtl' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
] as const;
const empty: LocalizedName = { en: '', ur: '', ar: '' };

/** CMS page editor: EN/UR/AR title + rich-text body, publish toggle. */
export default function CmsPageEditorPage() {
  const { id = 'new' } = useParams();
  const isNew = id === 'new';
  const { t } = useTranslation();
  const nav = useNavigate();
  const q = useAdminGet<CmsPage>(`pages/${id}`, undefined, { enabled: !isNew });
  const create = useAdminMutation<unknown, CmsPage>('post', ['pages']);
  const patch = useAdminMutation('patch', ['pages']);
  const del = useAdminMutation('delete', ['pages']);
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState<LocalizedName>(empty);
  const [body, setBody] = useState<LocalizedName>(empty);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!q.data) return;
    setSlug(q.data.slug);
    setTitle({ ...empty, ...q.data.title });
    setBody({ ...empty, ...q.data.body });
    setPublished(q.data.published);
  }, [q.data]);

  if (!isNew && q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!isNew && !q.data) return <Skeleton className="h-96" />;

  function save() {
    const fail = (e: unknown) => toast.error(getErrorMessage(e));
    if (isNew) {
      const parsed = adminPageSchema.safeParse({ slug, title, body, published });
      if (!parsed.success) return setError(`${parsed.error.issues[0]?.path.join('.')}: ${parsed.error.issues[0]?.message}`);
      create.mutate({ path: 'pages', body: parsed.data }, { onSuccess: (p) => (toast.success(t('admin.common.saved')), nav(`/admin/cms/pages/${p.id}`, { replace: true })), onError: fail });
    } else {
      const parsed = adminPageUpdateSchema.safeParse({ title, body, published });
      if (!parsed.success) return setError(`${parsed.error.issues[0]?.path.join('.')}: ${parsed.error.issues[0]?.message}`);
      patch.mutate({ path: `pages/${id}`, body: parsed.data }, { onSuccess: () => toast.success(t('admin.common.saved')), onError: fail });
    }
    setError(null);
  }

  return (
    <>
      <PageHeader
        title={isNew ? t('admin.cms.newPage') : title.en || slug}
        crumbs={[{ label: t('admin.nav.content') }, { label: t('admin.nav.pages'), to: '/admin/cms/pages' }]}
        actions={
          <>
            {!isNew && (
              <Button variant="ghost" size="sm" leftIcon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)}>
                {t('common.delete')}
              </Button>
            )}
            <Button size="sm" leftIcon={<Save className="size-4" />} loading={create.isPending || patch.isPending} onClick={save}>
              {t('admin.common.save')}
            </Button>
          </>
        }
      />
      {error && (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card className="p-5">
          <Tabs defaultValue="en">
            <TabsList>
              {LANGS.map((l) => (
                <TabsTrigger key={l.code} value={l.code}>
                  {l.label}
                  {!body[l.code]?.trim() && <span className="ms-1 size-1.5 rounded-full bg-warning" aria-label={t('admin.cms.missing')} />}
                </TabsTrigger>
              ))}
            </TabsList>
            {LANGS.map((l) => (
              <TabsContent key={l.code} value={l.code} className="grid gap-4 pt-4" dir={l.dir}>
                <FormField label={t('admin.cms.pageTitle')} required={l.code === 'en'}>
                  <Input value={title[l.code]} maxLength={160} onChange={(e) => setTitle({ ...title, [l.code]: e.target.value })} />
                </FormField>
                <FormField label={t('admin.cms.body')}>
                  <RichTextEditor value={body[l.code]} onChange={(html) => setBody((b) => ({ ...b, [l.code]: html }))} />
                </FormField>
              </TabsContent>
            ))}
          </Tabs>
        </Card>
        <Card className="grid content-start gap-4 p-5">
          <FormField label={t('admin.catalog.slug')} required hint={isNew ? t('admin.cms.slugHint') : t('admin.catalog.slugLocked')}>
            <Input dir="ltr" value={slug} disabled={!isNew} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="about" />
          </FormField>
          <Switch checked={published} onCheckedChange={setPublished} label={t('admin.cms.publishedLabel')} description={t('admin.cms.publishedHint')} />
          {!isNew && published && (
            <Button variant="outline" size="sm" href={`/pages/${slug}`} target="_blank" rel="noopener noreferrer">
              {t('admin.cms.viewSite')}
            </Button>
          )}
        </Card>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('admin.cms.deletePage')}
        confirmLabel={t('common.delete')}
        tone="danger"
        loading={del.isPending}
        onConfirm={() => del.mutate({ path: `pages/${id}` }, { onSuccess: () => (toast.success(t('admin.common.deleted')), nav('/admin/cms/pages')), onError: (e) => toast.error(getErrorMessage(e)) })}
      />
    </>
  );
}
