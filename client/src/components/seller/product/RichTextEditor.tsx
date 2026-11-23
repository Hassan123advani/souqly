import { useEffect, useRef, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Pilcrow, Unlink } from 'lucide-react';

type Cmd = { icon: ComponentType<{ className?: string }>; label: string; run: () => void };

/**
 * Minimal rich text editor (contentEditable + execCommand) emitting HTML. The server sanitizes
 * the HTML on save, so the client only needs to keep the markup simple.
 */
export function RichTextEditor({ value, onChange, id }: { value: string; onChange: (html: string) => void; id?: string }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  // Only push external values in (initial load / AI helper); never while typing, or the caret jumps.
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== value && document.activeElement !== el) el.innerHTML = value;
  }, [value]);

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    onChange(ref.current?.innerHTML ?? '');
  };
  const cmds: Cmd[] = [
    { icon: Bold, label: t('seller.editor.rte.bold'), run: () => exec('bold') },
    { icon: Italic, label: t('seller.editor.rte.italic'), run: () => exec('italic') },
    { icon: Heading2, label: t('seller.editor.rte.h2'), run: () => exec('formatBlock', 'h2') },
    { icon: Heading3, label: t('seller.editor.rte.h3'), run: () => exec('formatBlock', 'h3') },
    { icon: Pilcrow, label: t('seller.editor.rte.paragraph'), run: () => exec('formatBlock', 'p') },
    { icon: List, label: t('seller.editor.rte.bullets'), run: () => exec('insertUnorderedList') },
    { icon: ListOrdered, label: t('seller.editor.rte.numbers'), run: () => exec('insertOrderedList') },
    {
      icon: Link2,
      label: t('seller.editor.rte.link'),
      run: () => {
        const url = window.prompt(t('seller.editor.rte.linkPrompt'), 'https://');
        if (url && /^https?:\/\//i.test(url)) exec('createLink', url);
      },
    },
    { icon: Unlink, label: t('seller.editor.rte.unlink'), run: () => exec('unlink') },
  ];

  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface focus-within:ring-2 focus-within:ring-primary-500">
      <div className="flex flex-wrap gap-0.5 border-b border-border bg-surface-2 p-1" role="toolbar" aria-label={t('seller.editor.rte.toolbar')}>
        {cmds.map(({ icon: Icon, label, run }) => (
          <button
            key={label}
            type="button"
            title={label}
            aria-label={label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={run}
            className="grid size-8 place-items-center rounded text-fg-muted hover:bg-surface hover:text-fg"
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>
      <div
        id={id}
        ref={ref}
        role="textbox"
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        onInput={() => onChange(ref.current?.innerHTML ?? '')}
        className="prose-sm min-h-48 max-w-none p-3 text-sm text-fg outline-none [&_a]:text-primary-700 [&_a]:underline [&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mt-2 [&_h3]:font-bold [&_ol]:list-decimal [&_ol]:ps-5 [&_ul]:list-disc [&_ul]:ps-5"
      />
    </div>
  );
}
