import * as RTabs from '@radix-ui/react-tabs';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const Tabs = RTabs.Root;

export function TabsList({ className, ...rest }: ComponentPropsWithoutRef<typeof RTabs.List>) {
  return (
    <RTabs.List
      className={cn('inline-flex w-full gap-1 rounded-lg border border-border bg-surface-2 p-1', className)}
      {...rest}
    />
  );
}

export function TabsTrigger({ className, icon, children, ...rest }: ComponentPropsWithoutRef<typeof RTabs.Trigger> & { icon?: ReactNode }) {
  return (
    <RTabs.Trigger
      className={cn(
        'inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold text-fg-muted transition-colors duration-150',
        'hover:text-fg data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-card',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </RTabs.Trigger>
  );
}

export function TabsContent({ className, ...rest }: ComponentPropsWithoutRef<typeof RTabs.Content>) {
  return <RTabs.Content className={cn('mt-5 focus-visible:outline-none animate-fade-in', className)} {...rest} />;
}
