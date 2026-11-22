import { useState } from 'react';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';

const sizes = { xs: 'size-7 text-[10px]', sm: 'size-9 text-xs', md: 'size-11 text-sm', lg: 'size-16 text-lg', xl: 'size-24 text-2xl' };

export function Avatar({
  src,
  name,
  size = 'md',
  className,
}: {
  src?: string | null;
  name?: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImg = src && !failed;
  return (
    <span
      className={cn(
        'relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[#1A7A73] to-[#0B4A47] font-bold text-white ring-2 ring-surface',
        sizes[size],
        className,
      )}
      aria-hidden={!name}
      title={name}
    >
      {showImg ? (
        <img src={src} alt={name ?? ''} className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <span className="latin">{initials(name)}</span>
      )}
    </span>
  );
}
