const KEY = 'souqly-recent-searches';
const CAP = 8;

/** Guest search history in localStorage (signed-in users also get server history). */
export function readRecentSearches(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(0, CAP) : [];
  } catch {
    return [];
  }
}

export function pushRecentSearch(q: string): void {
  const term = q.trim().slice(0, 100);
  if (!term) return;
  try {
    const next = [term, ...readRecentSearches().filter((x) => x.toLowerCase() !== term.toLowerCase())].slice(0, CAP);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function removeRecentSearch(q: string): string[] {
  const next = readRecentSearches().filter((x) => x !== q);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
