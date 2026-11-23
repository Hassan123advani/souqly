import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { adminCategoryAttributesSchema } from '@souqly/shared';
import { useAdminMutation, type AdminCategory, type AttributeDef } from '@/api/admin';
import { getErrorMessage } from '@/api/client';
import { Alert, Button, Checkbox, EmptyState, IconButton, Input, Modal, Select } from '@/components/ui';
import { useLocalized } from '@/lib/catalog';

const TYPES: AttributeDef['type'][] = ['text', 'number', 'select', 'multiselect', 'boolean', 'color'];
type Row = AttributeDef & { optionsText: string };

/** Per-category attribute definitions (drive seller product forms and buyer filters). */
export function AttributesEditor({ category, onClose }: { category: AdminCategory; onClose: () => void }) {
  const { t } = useTranslation();
  const loc = useLocalized();
  const put = useAdminMutation('put', ['categories']);
  const [rows, setRows] = useState<Row[]>(() => category.attributes.map((a) => ({ ...a, optionsText: (a.options ?? []).join(', ') })));
  const [error, setError] = useState<string | null>(null);
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) =>
    setRows((rs) => {
      const n = [...rs];
      const j = i + d;
      if (j < 0 || j >= n.length) return rs;
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });

  function save() {
    const attributes = rows.map(({ optionsText, ...a }) => ({
      ...a,
      unit: a.unit?.trim() || undefined,
      options: a.type === 'select' || a.type === 'multiselect' ? optionsText.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    }));
    const parsed = adminCategoryAttributesSchema.safeParse({ attributes });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return setError(`${t('admin.catalog.attrRow', { n: Number(issue?.path[1] ?? 0) + 1 })}: ${issue?.path.slice(2).join('.')} — ${issue?.message}`);
    }
    setError(null);
    put.mutate({ path: `categories/${category.id}/attributes`, body: parsed.data }, { onSuccess: () => (toast.success(t('admin.common.saved')), onClose()), onError: (e) => toast.error(getErrorMessage(e)) });
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('admin.catalog.attributesFor', { name: loc(category.name) })}
      description={t('admin.catalog.attributesDesc')}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={put.isPending} onClick={save}>
            {t('admin.common.save')}
          </Button>
        </>
      }
    >
      {error && (
        <Alert tone="danger" className="mb-3">
          {error}
        </Alert>
      )}
      {!rows.length ? (
        <EmptyState compact title={t('admin.catalog.noAttributes')} />
      ) : (
        <ul className="grid gap-3">
          {rows.map((r, i) => (
            <li key={i} className="rounded-lg border border-border p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_150px_auto]">
                <Input dir="ltr" value={r.key} onChange={(e) => set(i, { key: e.target.value })} placeholder="key_name" aria-label={t('admin.catalog.attrKey')} />
                <Input value={r.label.en} onChange={(e) => set(i, { label: { ...r.label, en: e.target.value } })} placeholder={t('admin.catalog.attrLabelEn')} aria-label={t('admin.catalog.attrLabelEn')} />
                <Select value={r.type} onValueChange={(v) => set(i, { type: v as Row['type'] })} options={TYPES.map((x) => ({ value: x, label: t(`admin.catalog.types.${x}`) }))} />
                <div className="flex">
                  <IconButton size="sm" variant="ghost" label={t('admin.catalog.moveUp')} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp className="size-4" />
                  </IconButton>
                  <IconButton size="sm" variant="ghost" label={t('admin.catalog.moveDown')} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown className="size-4" />
                  </IconButton>
                  <IconButton size="sm" variant="ghost" label={t('common.delete')} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <Input dir="rtl" value={r.label.ur} onChange={(e) => set(i, { label: { ...r.label, ur: e.target.value } })} placeholder={t('admin.catalog.attrLabelUr')} aria-label={t('admin.catalog.attrLabelUr')} />
                <Input dir="rtl" value={r.label.ar} onChange={(e) => set(i, { label: { ...r.label, ar: e.target.value } })} placeholder={t('admin.catalog.attrLabelAr')} aria-label={t('admin.catalog.attrLabelAr')} />
                <Input value={r.unit ?? ''} onChange={(e) => set(i, { unit: e.target.value })} placeholder={t('admin.catalog.attrUnit')} aria-label={t('admin.catalog.attrUnit')} />
              </div>
              {(r.type === 'select' || r.type === 'multiselect') && (
                <Input className="mt-2" value={r.optionsText} onChange={(e) => set(i, { optionsText: e.target.value })} placeholder={t('admin.catalog.attrOptions')} aria-label={t('admin.catalog.attrOptions')} />
              )}
              <div className="mt-2 flex flex-wrap gap-4">
                <Checkbox checked={r.filterable} onChange={(e) => set(i, { filterable: e.target.checked })} label={t('admin.catalog.filterable')} />
                <Checkbox checked={r.variantDefining} onChange={(e) => set(i, { variantDefining: e.target.checked })} label={t('admin.catalog.variantDefining')} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <Button
        className="mt-3"
        variant="outline"
        size="sm"
        leftIcon={<Plus className="size-4" />}
        onClick={() => setRows((rs) => [...rs, { key: '', label: { en: '', ur: '', ar: '' }, type: 'text', filterable: false, variantDefining: false, optionsText: '' }])}
      >
        {t('admin.catalog.addAttribute')}
      </Button>
    </Modal>
  );
}
