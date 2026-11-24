import type { Analytics } from 'firebase/analytics';

/**
 * Firebase Analytics (GA4), loaded only after the visitor accepts analytics cookies. The Firebase
 * SDK is imported dynamically so it never lands in the main bundle; with no
 * VITE_FIREBASE_MEASUREMENT_ID everything here is a no-op.
 */
// Typed locally: vite/client leaves ImportMetaEnv keys as `any`.
const env = import.meta.env as unknown as Record<string, string | undefined>;
const measurementId = env.VITE_FIREBASE_MEASUREMENT_ID?.trim();

export const analyticsConfigured = !!measurementId && !!env.VITE_FIREBASE_API_KEY && !!env.VITE_FIREBASE_APP_ID;

type Sdk = { analytics: Analytics; mod: typeof import('firebase/analytics') };
let loading: Promise<Sdk | null> | null = null;

function load(): Promise<Sdk | null> {
  if (!analyticsConfigured) return Promise.resolve(null);
  loading ??= (async () => {
    const [{ initializeApp, getApps }, mod] = await Promise.all([import('firebase/app'), import('firebase/analytics')]);
    if (!(await mod.isSupported())) return null;
    const app =
      getApps()[0] ??
      initializeApp({
        apiKey: env.VITE_FIREBASE_API_KEY,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || undefined,
        databaseURL: env.VITE_FIREBASE_DATABASE_URL || undefined,
        projectId: env.VITE_FIREBASE_PROJECT_ID || undefined,
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || undefined,
        messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || undefined,
        appId: env.VITE_FIREBASE_APP_ID,
        measurementId,
      });
    // Page views are sent by the router tracker, so the automatic first one is turned off.
    const analytics = mod.initializeAnalytics(app, { config: { send_page_view: false } });
    return { analytics, mod };
  })().catch(() => {
    loading = null; // network / blocker failure: try again on the next consented page view
    return null;
  });
  return loading;
}

let enabled = false;

/** Turn collection on (loads the SDK on first use) or off after consent changes. */
export async function setAnalyticsConsent(granted: boolean): Promise<void> {
  enabled = granted;
  if (!granted) {
    // Only touch the SDK if it was already loaded; never download it just to switch it off.
    const sdk = loading ? await loading : null;
    sdk?.mod.setAnalyticsCollectionEnabled(sdk.analytics, false);
    clearGaCookies();
    return;
  }
  const sdk = await load();
  sdk?.mod.setAnalyticsCollectionEnabled(sdk.analytics, true);
}

export async function trackPageView(path: string, title: string): Promise<void> {
  if (!enabled) return;
  const sdk = await load();
  if (!sdk || !enabled) return;
  sdk.mod.logEvent(sdk.analytics, 'page_view', { page_path: path, page_location: window.location.href, page_title: title });
}

/** Best effort: drop the `_ga*` cookies GA4 already set when consent is withdrawn. */
function clearGaCookies() {
  try {
    const host = window.location.hostname;
    const domains = ['', host, `.${host}`, `.${host.split('.').slice(-2).join('.')}`];
    for (const part of document.cookie.split(';')) {
      const name = part.split('=')[0]?.trim();
      if (!name || !name.startsWith('_ga')) continue;
      for (const d of domains) document.cookie = `${name}=; Max-Age=0; path=/${d ? `; domain=${d}` : ''}`;
    }
  } catch {
    /* cookies unavailable */
  }
}
