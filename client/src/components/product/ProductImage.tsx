import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Lazy image with a fixed aspect ratio box (no layout shift) and a calm fallback when it fails. */
export function ProductImage({
  src,
  alt,
  className,
  imgClassName,
  eager,
  sizes,
}: {
  src?: string;
  alt: string;
  className?: string;
  imgClassName?: string;
  eager?: boolean;
  sizes?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={cn('relative overflow-hidden bg-surface-2', className)}>
      {!loaded && !failed && src && <div className="skeleton absolute inset-0 rounded-none" aria-hidden />}
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          sizes={sizes}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            'size-full object-cover transition-[opacity,transform] duration-400 ease-souq',
            loaded ? 'opacity-100' : 'opacity-0',
            imgClassName,
          )}
        />
      ) : (
        <div className="grid size-full place-items-center text-fg-subtle" role="img" aria-label={alt}>
          <ImageOff className="size-8" aria-hidden />
        </div>
      )}
    </div>
  );
}
