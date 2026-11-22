import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RotateCw } from 'lucide-react';
import i18n from '@/i18n';
import { LogoMark } from '@/components/brand/Logo';

type State = { error: Error | null };

/** Last-resort boundary: a branded crash screen instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Souqly] Unhandled UI error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    // A failed lazy chunk (new deploy) is fixed by a reload.
    const t = i18n.t.bind(i18n);
    return (
      <div className="grid min-h-dvh place-items-center bg-bg p-6">
        <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 text-center shadow-pop">
          <LogoMark className="mx-auto size-14" />
          <h1 className="mt-5 text-xl font-extrabold text-fg">{t('crash.title')}</h1>
          <p className="mt-2 text-sm text-fg-muted">{t('crash.body')}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-fg"
            >
              <RotateCw className="size-4" />
              {t('crash.reload')}
            </button>
            <a href="/" className="inline-flex h-11 items-center rounded-md border border-border-strong px-5 text-sm font-semibold text-fg">
              {t('crash.home')}
            </a>
          </div>
        </div>
      </div>
    );
  }
}
