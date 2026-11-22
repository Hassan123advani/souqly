import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProductCardVariant } from '@/components/product/ProductCard';

type ListingPrefs = { view: ProductCardVariant; setView: (v: ProductCardVariant) => void };

/** Grid/list preference for product listings, persisted as "souqly-listing". */
export const useListingPrefs = create<ListingPrefs>()(
  persist((set) => ({ view: 'grid', setView: (view) => set({ view }) }), { name: 'souqly-listing' }),
);
