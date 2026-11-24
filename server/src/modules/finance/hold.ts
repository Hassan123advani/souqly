import { getSetting } from '../settings/settings.service';

export const DAY_MS = 24 * 3600_000;
export const DEFAULT_HOLD_DAYS = 7;

/** Days an online sale credit stays on hold after delivery (return window; Setting `financeHoldDays`). */
export async function holdDays(): Promise<number> {
  const v = await getSetting<number>('financeHoldDays').catch(() => undefined);
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 60 ? v : DEFAULT_HOLD_DAYS;
}

/** Pure balance math over ledger rows: available = Σ amount − sale credits still on hold. */
export function computeBalance(rows: { type: string; amount: number; availableAt: Date }[], now = new Date()) {
  let total = 0;
  let onHold = 0;
  let lifetime = 0;
  let refunds = 0;
  for (const r of rows) {
    total += r.amount;
    if (r.type === 'sale') {
      lifetime += r.amount;
      if (r.availableAt > now) onHold += r.amount;
    }
    if (r.type === 'refund') refunds += -r.amount;
  }
  return { available: total - onHold, onHold, lifetime, refunds };
}
