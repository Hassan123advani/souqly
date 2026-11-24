import { create } from 'zustand';

/** Bump when the categories change so everyone is asked again. */
const VERSION = 1;
const KEY = 'souqly-consent';

export type ConsentChoice = { v: number; analytics: boolean; at: string };

function read(): ConsentChoice | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<ConsentChoice>;
    return c.v === VERSION && typeof c.analytics === 'boolean' && typeof c.at === 'string' ? (c as ConsentChoice) : null;
  } catch {
    return null;
  }
}

function write(c: ConsentChoice) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* storage blocked (private mode / quota): the choice holds for this tab only */
  }
}

type ConsentState = {
  /** Saved choice; null until the visitor decides (essential cookies only meanwhile). */
  choice: ConsentChoice | null;
  /** Banner visible: no choice yet, or reopened from "Cookie settings". */
  open: boolean;
  /** "Manage" panel with per-category switches. */
  manage: boolean;
  decide: (analytics: boolean) => void;
  /** Reopen the banner (footer "Cookie settings"), straight into the manage panel. */
  reopen: () => void;
  setManage: (manage: boolean) => void;
  close: () => void;
};

const initial = read();

export const useConsent = create<ConsentState>()((set) => ({
  choice: initial,
  open: !initial,
  manage: false,
  decide: (analytics) => {
    const choice = { v: VERSION, analytics, at: new Date().toISOString() };
    write(choice);
    set({ choice, open: false, manage: false });
  },
  reopen: () => set({ open: true, manage: true }),
  setManage: (manage) => set({ manage }),
  // Closing a reopened banner keeps the earlier choice; a first-time banner only closes by deciding.
  close: () => set((s) => (s.choice ? { open: false, manage: false } : s)),
}));
