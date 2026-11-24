/**
 * Monthly billing periods (UTC). A period starting on the 31st renews on the last day of shorter
 * months and goes back to the 31st when possible (Jan 31 → Feb 28/29 → Mar 31): the anchor day is
 * kept on the subscription instead of chaining from the previous end date.
 */
export function addMonths(from: Date, months: number, anchorDay = from.getUTCDate()): Date {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(anchorDay, lastDay), from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds(), from.getUTCMilliseconds()));
}

export const DAY = 86_400_000;
export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY);

/** Prorated unused credit of a paid period (floor, never negative, never more than the fee). */
export function unusedCredit(fee: number, periodStart: Date, periodEnd: Date, now: Date): number {
  const total = periodEnd.getTime() - periodStart.getTime();
  if (fee <= 0 || total <= 0) return 0;
  const left = Math.min(total, Math.max(0, periodEnd.getTime() - now.getTime()));
  return Math.min(fee, Math.floor((fee * left) / total));
}
