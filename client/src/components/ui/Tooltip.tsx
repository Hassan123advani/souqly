import * as RTooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

export const TooltipProvider = RTooltip.Provider;

export function Tooltip({
  content,
  children,
  side = 'top',
  disabled,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  disabled?: boolean;
}) {
  if (disabled) return <>{children}</>;
  return (
    <RTooltip.Root delayDuration={250}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={6}
          className="z-[80] max-w-xs rounded-md bg-ink-900 px-2.5 py-1.5 text-xs font-medium text-ink-50 shadow-pop animate-fade-in"
        >
          {content}
          <RTooltip.Arrow className="fill-ink-900" />
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}
