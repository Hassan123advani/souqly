import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { Clock, Copy, MapPin, MessageCircle, Plus, QrCode, Star, Users } from 'lucide-react';
import type { StorePublic } from '@souqly/shared';
import { Button, IconButton, Modal } from '@/components/ui';
import { MallBadge } from '@/components/product/ProductCard';
import { StoreLogo } from '@/components/product/StoreCard';
import { CHAT_READY, FOLLOW_READY } from '@/components/pdp/SellerCard';
import { cn } from '@/lib/cn';
import { absoluteUrl, compactNumber, useLang } from '@/lib/catalog';
import { formatDate } from '@/lib/format';

function ShareStoreModal({ store, open, onOpenChange }: { store: StorePublic; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const url = absoluteUrl(`/store/${store.slug}`);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('common.copied'));
    } catch {
      toast.error(t('share.copyFailed'));
    }
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t('store.shareTitle', { name: store.name })} description={t('store.shareBody')} size="sm">
      <div className="flex flex-col items-center gap-4 pb-3">
        <div className="rounded-lg border border-border bg-white p-4 shadow-card">
          <QRCodeSVG value={url} size={196} fgColor="#14201F" bgColor="#FFFFFF" level="M" marginSize={0} title={t('store.qrAlt', { name: store.name })} />
        </div>
        <div className="flex w-full items-center gap-2 rounded-md border border-border bg-surface-2 p-1.5 ps-3">
          <span className="latin min-w-0 flex-1 truncate text-sm text-fg-muted" dir="ltr">
            {url}
          </span>
          <Button size="sm" onClick={() => void copy()} leftIcon={<Copy className="size-4" />}>
            {t('common.copy')}
          </Button>
        </div>
        <Button
          variant="outline"
          block
          href={`https://wa.me/?text=${encodeURIComponent(`${store.name} ${url}`)}`}
          target="_blank"
          leftIcon={<MessageCircle className="size-4" />}
        >
          {t('share.whatsapp')}
        </Button>
      </div>
    </Modal>
  );
}

function Stats({ store, tone = 'default' }: { store: StorePublic; tone?: 'default' | 'onBrand' }) {
  const { t } = useTranslation();
  const lang = useLang();
  const items = [
    { icon: <Star className="size-3.5 fill-accent text-accent" aria-hidden />, label: t('store.ratingN', { n: store.ratingAvg.toFixed(1), c: compactNumber(store.ratingCount) }) },
    { icon: <Users className="size-3.5" aria-hidden />, label: t('store.followersN', { n: compactNumber(store.followerCount) }) },
    { icon: <MessageCircle className="size-3.5" aria-hidden />, label: t('store.responseN', { n: store.responseRate }) },
    { icon: <Clock className="size-3.5" aria-hidden />, label: t('store.joined', { date: formatDate(store.joinedAt, lang, { month: 'short', year: 'numeric' }) }) },
    ...(store.city ? [{ icon: <MapPin className="size-3.5" aria-hidden />, label: store.city }] : []),
  ];
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1.5 text-xs sm:text-sm', tone === 'onBrand' ? 'text-[color:var(--store-fg)] opacity-90' : 'text-fg-muted')}>
      {items.map((i) => (
        <li key={i.label} className="inline-flex items-center gap-1.5">
          {i.icon}
          {i.label}
        </li>
      ))}
    </ul>
  );
}

function Actions({ store, onShare, center }: { store: StorePublic; onShare: () => void; center?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={cn('flex flex-wrap items-center gap-2', center && 'justify-center')}>
      {FOLLOW_READY && (
        <Button size="sm" leftIcon={<Plus className="size-4" />} className="bg-[color:var(--store)] text-[color:var(--store-fg)]">
          {t('store.follow')}
        </Button>
      )}
      {CHAT_READY && (
        <Button size="sm" variant="outline" leftIcon={<MessageCircle className="size-4" />}>
          {t('store.chat')}
        </Button>
      )}
      <IconButton label={t('store.share')} variant="outline" size="sm" onClick={onShare} className="bg-surface">
        <QrCode className="size-4" />
      </IconButton>
      {store.isMall && <MallBadge size="md" />}
    </div>
  );
}

/** Store profile header; each layout template gives it a distinct treatment (D-042). */
export function StoreHeader({ store }: { store: StorePublic }) {
  const [share, setShare] = useState(false);
  const layout = store.layoutTemplate;
  const modal = <ShareStoreModal store={store} open={share} onOpenChange={setShare} />;
  const banner = store.banner ? <img src={store.banner} alt="" className="size-full object-cover" /> : null;

  if (layout === 'bold') {
    return (
      <header className="relative overflow-hidden rounded-xl text-[color:var(--store-fg)] shadow-pop" style={{ background: 'linear-gradient(120deg, var(--store), var(--store-deep))' }}>
        {/* Banner art often carries its own text, so the bold hero uses the brand gradient + lattice instead. */}
        <div className="souq-pattern absolute inset-0 opacity-40 [mask-image:linear-gradient(90deg,transparent_25%,#000)] rtl:[mask-image:linear-gradient(270deg,transparent_25%,#000)]" aria-hidden />
        <div className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-end sm:p-10">
          <StoreLogo src={store.logo} name={store.name} color={store.themeColor} className="size-20 border-4 border-white/30 text-2xl sm:size-28" />
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-black uppercase tracking-tight sm:text-5xl">{store.name}</h1>
            {store.tagline && <p className="mt-1 max-w-2xl text-base font-medium opacity-90 sm:text-lg">{store.tagline}</p>}
            <div className="mt-3">
              <Stats store={store} tone="onBrand" />
            </div>
          </div>
          <Actions store={store} onShare={() => setShare(true)} />
        </div>
        {modal}
      </header>
    );
  }

  if (layout === 'boutique') {
    return (
      <header className="text-center">
        <div className="aspect-[4/1] overflow-hidden rounded-xl bg-[color:var(--store)]">{banner}</div>
        <StoreLogo src={store.logo} name={store.name} color={store.themeColor} className="relative mx-auto -mt-12 size-24 border-4 text-2xl" />
        <h1 className="mt-3 text-2xl font-bold tracking-[0.08em] text-fg sm:text-3xl">{store.name}</h1>
        <span className="mx-auto mt-2 block h-0.5 w-12 rounded-full bg-[color:var(--store)]" aria-hidden />
        {store.tagline && <p className="mx-auto mt-3 max-w-xl text-sm italic text-fg-muted sm:text-base">{store.tagline}</p>}
        <div className="mt-4 flex justify-center">
          <Stats store={store} />
        </div>
        <div className="mt-4">
          <Actions store={store} onShare={() => setShare(true)} center />
        </div>
        {modal}
      </header>
    );
  }

  if (layout === 'minimal') {
    return (
      <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center">
        <StoreLogo src={store.logo} name={store.name} color={store.themeColor} className="size-16 border-border text-xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{store.name}</h1>
          {store.tagline && <p className="mt-0.5 text-sm text-fg-muted">{store.tagline}</p>}
          <div className="mt-2">
            <Stats store={store} />
          </div>
        </div>
        <Actions store={store} onShare={() => setShare(true)} />
        {modal}
      </header>
    );
  }

  // classic
  return (
    <header>
      <div className="aspect-[4/1] overflow-hidden rounded-xl bg-[color:var(--store)]">{banner}</div>
      <div className="relative mt-3 flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-card sm:mx-6 sm:-mt-10 sm:flex-row sm:items-center sm:p-5">
        <StoreLogo src={store.logo} name={store.name} color={store.themeColor} className="size-16 border-4 text-xl sm:size-20 sm:text-2xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-extrabold tracking-tight text-fg sm:text-2xl">{store.name}</h1>
          {store.tagline && <p className="mt-0.5 text-sm text-fg-muted">{store.tagline}</p>}
          <div className="mt-2">
            <Stats store={store} />
          </div>
        </div>
        <Actions store={store} onShare={() => setShare(true)} />
      </div>
      {modal}
    </header>
  );
}
