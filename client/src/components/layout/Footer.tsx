import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Smartphone } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { usePublicConfig } from '@/api/config';

export function Footer() {
  const { t } = useTranslation();
  const { data: cfg } = usePublicConfig();
  const payments = cfg?.integrations.payments;
  // COD is always available; others show only when the server enables them.
  const methods = [
    { key: 'cod', on: true },
    { key: 'jazzcash', on: !!payments?.jazzcash },
    { key: 'easypaisa', on: !!payments?.easypaisa },
    { key: 'card', on: !!payments?.stripe },
    { key: 'wallet', on: !!payments?.wallet },
  ].filter((m) => m.on);

  const cols = [
    {
      title: t('footer.shop'),
      links: [
        { to: '/categories', label: t('nav.categories') },
        { to: '/stores', label: t('footer.stores') },
        { to: '/mall', label: t('footer.mall') },
      ],
    },
    {
      title: t('footer.souqly'),
      links: [
        { to: '/about', label: t('footer.about') },
        { to: '/sell', label: t('footer.sell') },
      ],
    },
    {
      title: t('footer.support'),
      links: [
        { to: '/help', label: t('footer.help') },
        { to: '/account/addresses', label: t('footer.addresses') },
      ],
    },
    {
      title: t('footer.policies'),
      links: [
        { to: '/terms', label: t('footer.terms') },
        { to: '/privacy', label: t('footer.privacy') },
      ],
    },
  ];

  return (
    <footer className="mt-16 hidden border-t border-border bg-surface md:block">
      <div className="mx-auto grid w-full max-w-[1320px] gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.4fr_2fr] lg:px-8">
        <div className="max-w-sm">
          <Logo markClassName="size-10" />
          <p className="mt-4 text-sm leading-relaxed text-fg-muted">{t('footer.blurb')}</p>
          <div className="mt-5 flex items-start gap-3 rounded-lg border border-dashed border-border-strong bg-bg p-3.5 text-sm">
            <Smartphone className="mt-0.5 size-5 shrink-0 text-primary-700" />
            <p className="text-fg-muted">
              <span className="font-semibold text-fg">{t('footer.appTitle')}</span> {t('footer.appBody')}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {cols.map((c) => (
            <div key={c.title}>
              <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-fg-subtle">{c.title}</h2>
              <ul className="mt-4 space-y-2.5">
                {c.links.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to} className="text-sm text-fg-muted transition-colors hover:text-primary-700">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <p className="text-xs text-fg-subtle">{t('footer.copyright', { year: new Date().getFullYear() })}</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-fg-subtle">{t('footer.weAccept')}</span>
            {methods.map((m) => (
              <span
                key={m.key}
                className="rounded-md border border-border bg-bg px-2.5 py-1 text-[11px] font-bold tracking-wide text-fg-muted"
              >
                {t(`payments.${m.key}`)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
