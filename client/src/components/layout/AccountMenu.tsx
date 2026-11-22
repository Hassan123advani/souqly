import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { LayoutDashboard, LogOut, MapPin, Settings2, ShieldCheck, ShoppingBag, Store, User, UserRound } from 'lucide-react';
import { useLogout, useMe } from '@/api/auth';
import { useModeToggle } from '@/hooks/useModeToggle';
import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui';
import { cn } from '@/lib/cn';

/** Segmented Buyer | Seller control. Used in the account menu and Preferences. */
export function ModeSwitch({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const toggle = useModeToggle();
  if (!me) return null;
  const mode = me.activeMode;
  const opt = (value: 'buyer' | 'seller', Icon: typeof Store) => (
    <button
      type="button"
      role="radio"
      aria-checked={mode === value}
      disabled={toggle.isPending}
      onClick={() => mode !== value && toggle.switchTo(value)}
      className={cn(
        'inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-bold transition-colors',
        mode === value ? 'bg-surface text-fg shadow-card' : 'text-fg-muted hover:text-fg',
      )}
    >
      <Icon className="size-3.5" />
      {t(`mode.${value}`)}
    </button>
  );
  return (
    <div role="radiogroup" aria-label={t('mode.label')} className={cn('flex gap-1 rounded-lg bg-surface-2 p-1', className)}>
      {opt('buyer', ShoppingBag)}
      {opt('seller', Store)}
    </div>
  );
}

export function AccountMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: me, isPending } = useMe();
  const logout = useLogout();

  if (isPending) return <span className="skeleton size-10 rounded-full" aria-hidden />;
  if (!me) {
    return (
      <Button to="/login" variant="ghost" size="sm" className="h-11 rounded-pill px-3" leftIcon={<UserRound className="size-[18px]" />}>
        <span className="hidden sm:inline">{t('header.signIn')}</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-11 items-center gap-2 rounded-pill pe-1 ps-1 hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring lg:pe-3"
          aria-label={t('header.accountMenu')}
        >
          <Avatar src={me.avatarUrl} name={me.name} size="sm" />
          <span className="hidden max-w-28 truncate text-sm font-semibold lg:inline">{me.name.split(' ')[0]}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72">
        <div className="flex items-center gap-3 px-2.5 pb-3 pt-2">
          <Avatar src={me.avatarUrl} name={me.name} size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{me.name}</p>
            <p className="latin truncate text-xs text-fg-muted">{me.email}</p>
          </div>
        </div>
        <ModeSwitch className="mx-1 mb-1" />
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<User />} onSelect={() => navigate('/account/profile')}>
          {t('account.nav.profile')}
        </DropdownMenuItem>
        <DropdownMenuItem icon={<MapPin />} onSelect={() => navigate('/account/addresses')}>
          {t('account.nav.addresses')}
        </DropdownMenuItem>
        <DropdownMenuItem icon={<ShieldCheck />} onSelect={() => navigate('/account/security')}>
          {t('account.nav.security')}
        </DropdownMenuItem>
        <DropdownMenuItem icon={<Settings2 />} onSelect={() => navigate('/account/preferences')}>
          {t('account.nav.preferences')}
        </DropdownMenuItem>
        {(me.isSeller || me.platformRole) && <DropdownMenuSeparator />}
        {me.isSeller && (
          <DropdownMenuItem icon={<Store />} onSelect={() => navigate('/seller')}>
            {t('nav.sellerCenter')}
          </DropdownMenuItem>
        )}
        {me.platformRole && (
          <DropdownMenuItem icon={<LayoutDashboard />} onSelect={() => navigate('/admin')}>
            {t('nav.adminPanel')}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          icon={<LogOut />}
          danger
          onSelect={() =>
            logout.mutate(undefined, {
              onSettled: () => {
                toast.success(t('auth.loggedOut'));
                navigate('/');
              },
            })
          }
        >
          {t('header.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
