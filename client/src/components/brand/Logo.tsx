import { cn } from '@/lib/cn';

/**
 * Souqly mark: a souq doorway arch (deep teal) carrying a saffron "S" ribbon,
 * with a lantern glow at the apex. Colors come from tokens so it adapts to dark mode.
 */
export function LogoMark({ className, title = 'Souqly' }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('size-9 shrink-0', className)} role="img" aria-label={title}>
      <path
        d="M9 57.5V30.5C9 17.6 18.6 8.6 32 2.5c13.4 6.1 23 15.1 23 28v27c0 2.2-1.8 4-4 4H13c-2.2 0-4-1.8-4-4Z"
        style={{ fill: 'rgb(var(--logo-arch))' }}
      />
      <path
        d="M14.5 61.5V32c0-9.6 6.6-16.4 17.5-22.3C42.9 15.6 49.5 22.4 49.5 32v29.5"
        fill="none"
        style={{ stroke: 'rgb(var(--logo-inner))' }}
        strokeWidth="1.6"
      />
      <path
        d="M41.5 27c-2.6-4-17.5-5-17.5 3.6 0 8.4 17 6 17 15.1 0 8.6-15.6 8.6-18.5 3.6"
        fill="none"
        stroke="#F2A93B"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="15.5" r="2.6" fill="#F2A93B" />
    </svg>
  );
}

export function Logo({
  variant = 'full',
  className,
  markClassName,
  showArabic = true,
}: {
  variant?: 'full' | 'mark';
  className?: string;
  markClassName?: string;
  showArabic?: boolean;
}) {
  if (variant === 'mark') return <LogoMark className={cn(markClassName, className)} />;
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)} dir="ltr">
      <LogoMark className={markClassName} title="" />
      <span className="latin text-[1.45rem] font-extrabold leading-none tracking-[-0.03em] text-fg" aria-label="Souqly">
        Souq<span className="text-primary-700">ly</span>
      </span>
      {showArabic && (
        <>
          <span className="h-5 w-px bg-border-strong" aria-hidden />
          <span className="font-arabic text-[1.05rem] font-semibold leading-none text-accent-700" lang="ar" aria-hidden>
            سوقلي
          </span>
        </>
      )}
    </span>
  );
}
