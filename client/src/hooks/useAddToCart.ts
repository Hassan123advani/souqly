import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ProductDetail, ProductVariantDTO } from '@souqly/shared';
import { useCart } from '@/stores/cart';

/** Unit price for a variant, honouring a running flash sale. */
export function unitPrice(p: ProductDetail, v: ProductVariantDTO): { price: number; compareAt?: number } {
  const flash = p.flash && (!p.flash.variantId || p.flash.variantId === v.id) && new Date(p.flash.endsAt).getTime() > Date.now();
  if (flash) return { price: p.flash!.price, compareAt: Math.max(v.compareAtPrice ?? 0, v.price) };
  return { price: v.price, compareAt: v.compareAtPrice };
}

/** Adds a product variant to the local cart and confirms with a toast (Phase 6 syncs with the server). */
export function useAddToCart() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const add = useCart((s) => s.add);

  return useCallback(
    (p: ProductDetail, v: ProductVariantDTO, qty: number, opts: { silent?: boolean } = {}) => {
      const { price, compareAt } = unitPrice(p, v);
      add({
        productId: p.id,
        variantId: v.id,
        qty,
        snapshot: {
          title: p.title,
          slug: p.slug,
          image: v.images?.[0] ?? p.images[0]?.url ?? '',
          price,
          ...(compareAt ? { compareAtPrice: compareAt } : {}),
          sku: v.sku,
          options: v.options,
          store: { slug: p.store.slug, name: p.store.name },
          maxQty: Math.max(1, v.stock),
        },
      });
      if (!opts.silent)
        toast.success(t('cart.added'), {
          description: p.title,
          action: { label: t('cart.view'), onClick: () => navigate('/cart') },
        });
    },
    [add, navigate, t],
  );
}
