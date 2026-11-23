import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import type { ChatSettings, NotificationSettings } from '@souqly/shared';
import { getErrorMessage } from '@/api/client';
import { useSaveSellerSettings, useSellerSettings } from '@/api/seller';
import { Button, ErrorState, FormField, IconButton, Input, Skeleton, Switch, Textarea } from '@/components/ui';
import { playChime } from '@/lib/socket';
import { useSellerPrefs } from '../useSellerPrefs';

export function NotificationsTab() {
  const { t } = useTranslation();
  const q = useSellerSettings('notifications');
  const save = useSaveSellerSettings('notifications');
  const { muted, setMuted } = useSellerPrefs();
  const [threshold, setThreshold] = useState('');
  useEffect(() => {
    if (q.data) setThreshold(String(q.data.lowStockThreshold));
  }, [q.data]);
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (q.isLoading || !q.data) return <Skeleton className="h-40" />;
  const put = (b: Partial<NotificationSettings>) => save.mutate(b, { onError: (e) => toast.error(getErrorMessage(e)) });
  return (
    <div className="grid gap-5">
      <Switch checked={q.data.newOrderEmail} onCheckedChange={(v) => put({ newOrderEmail: v })} label={t('seller.notify.newOrderEmail')} />
      <Switch checked={q.data.lowStockEmail} onCheckedChange={(v) => put({ lowStockEmail: v })} label={t('seller.notify.lowStockEmail')} />
      <div className="flex flex-wrap items-end gap-2">
        <FormField label={t('seller.notify.threshold')} hint={t('seller.notify.thresholdHint')} className="w-48">
          <Input inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </FormField>
        <Button variant="outline" loading={save.isPending} onClick={() => put({ lowStockThreshold: Math.max(0, Math.round(Number(threshold) || 0)) })}>
          {t('seller.common.save')}
        </Button>
      </div>
      <div className="grid gap-2 rounded-lg border border-border p-4">
        <Switch
          checked={!muted}
          onCheckedChange={(on) => {
            setMuted(!on);
            put({ newOrderSound: on });
          }}
          label={t('seller.notify.sound')}
          description={t('seller.notify.soundHint')}
        />
        <Button variant="ghost" size="sm" className="w-fit" onClick={playChime}>
          {t('seller.notify.testSound')}
        </Button>
      </div>
    </div>
  );
}

export function ChatTab() {
  const { t } = useTranslation();
  const q = useSellerSettings('chat');
  const save = useSaveSellerSettings('chat');
  const [form, setForm] = useState<ChatSettings>({ quickReplies: [], autoReply: { enabled: false, message: '' } });
  useEffect(() => {
    if (q.data) setForm(q.data);
  }, [q.data]);
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (q.isLoading) return <Skeleton className="h-40" />;
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <p className="text-sm font-bold text-fg">{t('seller.chat.quickReplies')}</p>
        <p className="text-xs text-fg-muted">{t('seller.chat.quickRepliesHint')}</p>
        {form.quickReplies.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={r}
              maxLength={300}
              aria-label={`${t('seller.chat.quickReplies')} ${i + 1}`}
              onChange={(e) => setForm({ ...form, quickReplies: form.quickReplies.map((x, j) => (j === i ? e.target.value : x)) })}
            />
            <IconButton label={t('seller.common.remove')} variant="ghost" size="sm" onClick={() => setForm({ ...form, quickReplies: form.quickReplies.filter((_, j) => j !== i) })}>
              <Trash2 className="size-4" />
            </IconButton>
          </div>
        ))}
        {form.quickReplies.length < 20 && (
          <Button variant="outline" size="sm" className="w-fit" leftIcon={<Plus className="size-4" />} onClick={() => setForm({ ...form, quickReplies: [...form.quickReplies, ''] })}>
            {t('seller.chat.addReply')}
          </Button>
        )}
      </div>
      <div className="grid gap-3 rounded-lg border border-border p-4">
        <Switch checked={form.autoReply.enabled} onCheckedChange={(enabled) => setForm({ ...form, autoReply: { ...form.autoReply, enabled } })} label={t('seller.chat.autoReply')} description={t('seller.chat.autoReplyHint')} />
        {form.autoReply.enabled && (
          <Textarea rows={3} maxLength={500} value={form.autoReply.message} aria-label={t('seller.chat.autoReply')} onChange={(e) => setForm({ ...form, autoReply: { ...form.autoReply, message: e.target.value } })} />
        )}
      </div>
      <Button
        className="w-fit"
        loading={save.isPending}
        onClick={() =>
          save.mutate(
            { quickReplies: form.quickReplies.map((r) => r.trim()).filter(Boolean), autoReply: { enabled: form.autoReply.enabled, message: form.autoReply.message.trim() } },
            { onSuccess: () => toast.success(t('seller.common.saved')), onError: (e) => toast.error(getErrorMessage(e)) },
          )
        }
      >
        {t('seller.common.save')}
      </Button>
    </div>
  );
}
