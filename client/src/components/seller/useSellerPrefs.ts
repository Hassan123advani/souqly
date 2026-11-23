import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type SellerPrefs = {
  /** Mute the new-order chime. */
  muted: boolean;
  /** The first-visit Seller Center tour was finished or dismissed. */
  tourDone: boolean;
  /** The onboarding checklist card was hidden. */
  checklistHidden: boolean;
  setMuted: (v: boolean) => void;
  setTourDone: (v: boolean) => void;
  setChecklistHidden: (v: boolean) => void;
};

export const useSellerPrefs = create<SellerPrefs>()(
  persist(
    (set) => ({
      muted: false,
      tourDone: false,
      checklistHidden: false,
      setMuted: (muted) => set({ muted }),
      setTourDone: (tourDone) => set({ tourDone }),
      setChecklistHidden: (checklistHidden) => set({ checklistHidden }),
    }),
    { name: 'souqly-seller-prefs' },
  ),
);
