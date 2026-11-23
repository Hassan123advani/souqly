/** ISO → value for <input type="datetime-local"> in local time. */
export function toLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
/** datetime-local value → ISO (UTC). */
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : '');

/** live / scheduled / ended for anything with a time window. */
export function windowState(startsAt: string, endsAt: string, now = Date.now()): 'live' | 'scheduled' | 'ended' {
  if (new Date(startsAt).getTime() > now) return 'scheduled';
  if (new Date(endsAt).getTime() < now) return 'ended';
  return 'live';
}
