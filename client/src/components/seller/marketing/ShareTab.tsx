import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Copy, Download, ImageOff } from 'lucide-react';
import type { SellerProduct } from '@souqly/shared';
import { useSellerStore } from '@/api/seller';
import { publicApiUrl } from '@/api/growth';
import { Button, Card, CardHeader, buttonClasses } from '@/components/ui';
import { absoluteUrl } from '@/lib/catalog';
import { ProductSearchAdd } from '../growth/ProductPicker';

/** Branded 1200×630 share images (server-rendered SVG) for the store and its products. */
export function ShareTab() {
  const { t } = useTranslation();
  const { data: store } = useSellerStore();
  const [product, setProduct] = useState<SellerProduct | null>(null);
  if (!store) return null;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <ShareCard
        title={t('growth.share.store')}
        description={store.status === 'approved' ? t('growth.share.storeHint') : t('growth.share.storeNotLive')}
        image={store.status === 'approved' ? publicApiUrl(`/stores/${store.slug}/share-image.svg`) : null}
        link={absoluteUrl(`/store/${store.slug}`)}
        filename={`${store.slug}-share.svg`}
      />
      <div className="grid content-start gap-3">
        <ShareCard
          title={t('growth.share.product')}
          description={t('growth.share.productHint')}
          image={product && product.status === 'published' ? publicApiUrl(`/products/${product.slug}/share-image.svg`) : null}
          link={product ? absoluteUrl(`/p/${product.slug}`) : null}
          filename={product ? `${product.slug}-share.svg` : 'share.svg'}
          picker={<ProductSearchAdd onAdd={setProduct} />}
          emptyText={product ? t('growth.share.notPublished') : t('growth.share.pickProduct')}
        />
      </div>
    </div>
  );
}

function ShareCard({
  title,
  description,
  image,
  link,
  filename,
  picker,
  emptyText,
}: {
  title: string;
  description: string;
  image: string | null;
  link: string | null;
  filename: string;
  picker?: ReactNode;
  emptyText?: string;
}) {
  const { t } = useTranslation();
  const [broken, setBroken] = useState<string | null>(null);
  const copy = (text: string) =>
    navigator.clipboard.writeText(text).then(
      () => toast.success(t('common.copied')),
      () => toast.error(t('share.copyFailed')),
    );
  const ok = image && broken !== image;
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <div className="grid gap-3 p-4">
        {picker}
        <div className="grid aspect-[1200/630] place-items-center overflow-hidden rounded-md border border-border bg-surface-2">
          {ok ? (
            <img src={image} alt={title} className="size-full object-contain" onError={() => setBroken(image)} />
          ) : (
            <div className="flex flex-col items-center gap-2 p-4 text-center text-sm text-fg-muted">
              <ImageOff className="size-6" />
              {image ? t('growth.share.failed') : emptyText}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {link && (
            <Button size="sm" variant="outline" leftIcon={<Copy className="size-4" />} onClick={() => void copy(link)}>
              {t('growth.share.copyLink')}
            </Button>
          )}
          {ok && (
            <>
              <Button size="sm" variant="outline" leftIcon={<Copy className="size-4" />} onClick={() => void copy(new URL(image, window.location.origin).href)}>
                {t('growth.share.copyImage')}
              </Button>
              <a href={image} download={filename} target="_blank" rel="noreferrer" className={buttonClasses({ variant: 'ghost', size: 'sm', className: 'gap-2' })}>
                <Download className="size-4" />
                {t('growth.share.download')}
              </a>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
