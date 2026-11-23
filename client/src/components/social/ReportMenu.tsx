import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Flag, MoreHorizontal } from 'lucide-react';
import type { ReportTarget } from '@souqly/shared';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, IconButton } from '@/components/ui';
import { ReportDialog } from './ReportDialog';
import { useAuthGate } from './useAuthGate';

/** "More" menu with a single "Report product/store" item that opens the report dialog. */
export function ReportMenu({ targetType, targetId, className }: { targetType: ReportTarget; targetId: string; className?: string }) {
  const { t } = useTranslation();
  const gate = useAuthGate();
  const [open, setOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton label={t('common.moreActions')} variant="outline" size="sm" className={className}>
            <MoreHorizontal className="size-4" />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem danger icon={<Flag className="size-4" />} onSelect={() => gate(() => setOpen(true))}>
            {t(`social.report.menu.${targetType}`)}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {open && <ReportDialog open onOpenChange={setOpen} targetType={targetType} targetId={targetId} />}
    </>
  );
}
