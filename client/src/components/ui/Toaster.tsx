import { Toaster as Sonner } from 'sonner';
import { useEffect, useState } from 'react';
import { resolveTheme, useUi } from '@/stores/ui';

/** Sonner, themed with Souq Dusk tokens and following the app theme + direction. */
export function Toaster() {
  const theme = useUi((s) => s.theme);
  const language = useUi((s) => s.language);
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => resolveTheme(theme));
  useEffect(() => setResolved(resolveTheme(theme)), [theme]);
  const rtl = language !== 'en';
  return (
    <Sonner
      theme={resolved}
      dir={rtl ? 'rtl' : 'ltr'}
      position={rtl ? 'top-left' : 'top-right'}
      closeButton
      richColors={false}
      toastOptions={{
        classNames: {
          toast:
            'group !rounded-lg !border !border-border !bg-surface !text-fg !shadow-pop !font-[inherit] data-[type=success]:!border-s-4 data-[type=success]:!border-s-success data-[type=error]:!border-s-4 data-[type=error]:!border-s-danger data-[type=info]:!border-s-4 data-[type=info]:!border-s-info data-[type=warning]:!border-s-4 data-[type=warning]:!border-s-warning',
          description: '!text-fg-muted',
          actionButton: '!bg-primary !text-primary-fg',
          cancelButton: '!bg-surface-2 !text-fg',
          closeButton: '!bg-surface !border-border !text-fg-muted',
          success: '[&_[data-icon]]:!text-success',
          error: '[&_[data-icon]]:!text-danger',
          info: '[&_[data-icon]]:!text-info',
          warning: '[&_[data-icon]]:!text-warning',
        },
      }}
    />
  );
}
