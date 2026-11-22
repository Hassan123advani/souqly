import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

type ModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Hide the close (X) button, e.g. for forced flows. */
  hideClose?: boolean;
  className?: string;
};

const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

export function Modal({ open, onOpenChange, title, description, children, footer, size = 'md', hideClose, className }: ModalProps) {
  const { t } = useTranslation();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-ink-950/50 backdrop-blur-[2px] animate-fade-in" />
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
        <Dialog.Content
          className={cn(
            'pointer-events-auto flex max-h-[92dvh] w-full flex-col rounded-t-xl border border-border bg-surface shadow-pop animate-slide-up',
            'focus:outline-none sm:max-h-[88dvh] sm:rounded-xl sm:animate-zoom-in',
            widths[size],
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-5 sm:px-6">
            <div>
              <Dialog.Title className="text-lg font-bold text-fg">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-sm text-fg-muted">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            {!hideClose && (
              <Dialog.Close
                className="-me-2 -mt-1 grid size-10 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg"
                aria-label={t('common.close')}
              >
                <X className="size-5" />
              </Dialog.Close>
            )}
          </div>
          <div className="overflow-y-auto px-5 py-3 sm:px-6">{children}</div>
          {footer && (
            <div className="safe-bottom flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4 sm:px-6">
              {footer}
            </div>
          )}
        </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
