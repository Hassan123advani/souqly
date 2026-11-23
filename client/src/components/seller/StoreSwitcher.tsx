import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bell, BellOff, Check, ChevronsUpDown } from 'lucide-react';
import { useMe } from '@/api/auth';
import { Avatar, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, Tooltip } from '@/components/ui';
import { useActiveStore, useActiveStoreId } from './useActiveStore';
import { useSellerPrefs } from './useSellerPrefs';

/** Store switcher (only when the user belongs to several stores) + new-order sound toggle. */
export function SellerSidebarFooter() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const activeId = useActiveStoreId();
  const setStoreId = useActiveStore((s) => s.setStoreId);
  const qc = useQueryClient();
  const { muted, setMuted } = useSellerPrefs();
  const stores = me?.stores ?? [];
  const active = stores.find((s) => s.id === activeId);

  const MuteIcon = muted ? BellOff : Bell;
  return (
    <div className="flex flex-col gap-1">
      {stores.length > 1 && active && (
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex h-11 w-full min-w-0 items-center gap-2 rounded-md border border-border px-2 text-start text-sm font-semibold text-fg hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            aria-label={t('seller.switcher.label')}
          >
            <Avatar name={active.name} src={active.logoUrl} size="sm" />
            <span className="min-w-0 flex-1 truncate">{active.name}</span>
            <ChevronsUpDown className="size-4 shrink-0 text-fg-subtle" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel>{t('seller.switcher.label')}</DropdownMenuLabel>
            {stores.map((s) => (
              <DropdownMenuItem
                key={s.id}
                onSelect={() => {
                  setStoreId(s.id);
                  void qc.invalidateQueries({ queryKey: ['seller'] });
                }}
              >
                <Avatar name={s.name} src={s.logoUrl} size="sm" />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                {s.id === activeId && <Check className="size-4 text-primary-700" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Tooltip content={muted ? t('seller.switcher.soundOff') : t('seller.switcher.soundOn')} side="right">
        <button
          type="button"
          onClick={() => setMuted(!muted)}
          aria-pressed={!muted}
          aria-label={t('seller.switcher.sound')}
          className="grid size-10 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >
          <MuteIcon className="size-4" />
        </button>
      </Tooltip>
    </div>
  );
}
