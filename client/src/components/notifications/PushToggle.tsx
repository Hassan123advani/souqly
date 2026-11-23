import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { usePublicConfig } from '@/api/config';
import { getErrorMessage } from '@/api/client';
import { deletePushSubscription, savePushSubscription, type PushSubscriptionBody } from '@/api/notifications';
import { Switch } from '@/components/ui';

function base64UrlToBytes(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/**
 * Browser push opt-in. Rendered only when the server has web push (VAPID) configured, the browser
 * supports it and the PWA service worker is registered (production builds).
 */
export function PushToggle() {
  const { t } = useTranslation();
  const { data: config } = usePublicConfig();
  const key = config?.integrations.webPush ? config.integrations.vapidPublicKey : undefined;
  const [reg, setReg] = useState<ServiceWorkerRegistration | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(() => supported() && Notification.permission === 'denied');

  useEffect(() => {
    if (!key || !supported()) return;
    let alive = true;
    void navigator.serviceWorker.getRegistration().then(async (r) => {
      if (!alive || !r) return;
      setReg(r);
      const sub = await r.pushManager.getSubscription();
      if (alive) setSubscribed(!!sub);
    });
    return () => {
      alive = false;
    };
  }, [key]);

  if (!key || !reg) return null;

  async function toggle(on: boolean) {
    if (!reg || !key) return;
    setBusy(true);
    try {
      if (on) {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          setDenied(perm === 'denied');
          return;
        }
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(key) as BufferSource }));
        await savePushSubscription(sub.toJSON() as PushSubscriptionBody);
        setSubscribed(true);
        toast.success(t('notifications.push.enabled'));
      } else {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await deletePushSubscription(sub.endpoint).catch(() => undefined);
          await sub.unsubscribe();
        }
        setSubscribed(false);
        toast.success(t('notifications.push.disabled'));
      }
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="py-4">
      <Switch
        checked={subscribed}
        disabled={busy || denied}
        onCheckedChange={(v) => void toggle(v)}
        label={t('notifications.push.label')}
        description={denied ? t('notifications.push.blocked') : t('notifications.push.hint')}
      />
    </div>
  );
}
