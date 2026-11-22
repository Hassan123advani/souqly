import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Logical side: "start" is left in LTR and right in RTL. */
  side?: 'start' | 'end' | 'bottom';
  title: ReactNode;
  hideTitle?: boolean;
  children: ReactNode;
  className?: string;
};

export function Sheet({ open, onOpenChange, side = 'end', title, hideTitle, children, className }: SheetProps) {
  const { t } = useTranslation();
  const sideCls = {
    start: 'inset-y-0 start-0 h-full w-[min(88vw,360px)] border-e ltr:animate-slide-in-left rtl:animate-slide-in-right',
    end: 'inset-y-0 end-0 h-full w-[min(92vw,420px)] border-s ltr:animate-slide-in-right rtl:animate-slide-in-left',
    bottom: 'inset-x-0 bottom-0 max-h-[88dvh] rounded-t-xl border-t animate-slide-up',
  }[side];
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-ink-950/45 backdrop-blur-[2px] animate-fade-in" />
        <Dialog.Content
          className={cn('fixed z-[60] flex flex-col border-border bg-surface shadow-pop focus:outline-none', sideCls, className)}
        >
          <div className={cn('flex items-center justify-between gap-3 px-4 py-3', !hideTitle && 'border-b border-border')}>
            <Dialog.Title className={cn('text-base font-bold', hideTitle && 'sr-only')}>{title}</Dialog.Title>
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
            <Dialog.Close
              className="grid size-10 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg"
              aria-label={t('common.close')}
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <div className="safe-bottom flex-1 overflow-y-auto">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
