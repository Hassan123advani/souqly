import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, Plus } from 'lucide-react';
import { useFollowStatus, useToggleFollow } from '@/api/social';
import { Button, type ButtonProps } from '@/components/ui';
import { cn } from '@/lib/cn';
import { socialError } from './errors';
import { useAuthGate } from './useAuthGate';

/** Follow / Following toggle (optimistic). Guests are sent to login. */
export function FollowButton({ slug, className, size = 'sm', variant }: { slug: string; className?: string; size?: ButtonProps['size']; variant?: ButtonProps['variant'] }) {
  const { t } = useTranslation();
  const status = useFollowStatus(slug);
  const toggle = useToggleFollow(slug);
  const gate = useAuthGate();
  const following = !!status.data?.following;
  return (
    <Button
      size={size}
      variant={variant ?? (following ? 'outline' : 'secondary')}
      aria-pressed={following}
      className={cn('min-w-[7rem]', className)}
      leftIcon={following ? <Check className="size-4" /> : <Plus className="size-4" />}
      onClick={() =>
        gate(() =>
          toggle.mutate(!following, {
            onSuccess: (d) => toast.success(d.following ? t('social.follow.followed') : t('social.follow.unfollowed')),
            onError: (e) => toast.error(socialError(e)),
          }),
        )
      }
    >
      {following ? t('social.follow.following') : t('social.follow.follow')}
    </Button>
  );
}

/** Live follower count (falls back to the count shipped with the store card). */
export function useFollowerCount(slug: string, fallback: number): number {
  const { data } = useFollowStatus(slug);
  return data?.followerCount ?? fallback;
}
