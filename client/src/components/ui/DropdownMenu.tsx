import * as RMenu from '@radix-ui/react-dropdown-menu';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const DropdownMenu = RMenu.Root;
export const DropdownMenuTrigger = RMenu.Trigger;
export const DropdownMenuGroup = RMenu.Group;

export function DropdownMenuContent({ className, align = 'end', ...rest }: ComponentPropsWithoutRef<typeof RMenu.Content>) {
  return (
    <RMenu.Portal>
      <RMenu.Content
        align={align}
        sideOffset={8}
        className={cn(
          'z-[70] min-w-56 overflow-hidden rounded-lg border border-border bg-surface p-1.5 text-fg shadow-pop animate-zoom-in',
          className,
        )}
        {...rest}
      />
    </RMenu.Portal>
  );
}

const itemCls =
  'relative flex min-h-10 cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none transition-colors ' +
  'data-[highlighted]:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-muted';

export function DropdownMenuItem({
  className,
  icon,
  danger,
  children,
  ...rest
}: ComponentPropsWithoutRef<typeof RMenu.Item> & { icon?: ReactNode; danger?: boolean }) {
  return (
    <RMenu.Item className={cn(itemCls, danger && 'text-danger [&_svg]:text-danger', className)} {...rest}>
      {icon}
      {children}
    </RMenu.Item>
  );
}

export function DropdownMenuLabel({ className, ...rest }: ComponentPropsWithoutRef<typeof RMenu.Label>) {
  return <RMenu.Label className={cn('px-2.5 py-2 text-xs font-semibold text-fg-muted', className)} {...rest} />;
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <RMenu.Separator className={cn('-mx-1.5 my-1.5 h-px bg-border', className)} />;
}
