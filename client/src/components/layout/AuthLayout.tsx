import { Suspense } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, HandCoins, Truck } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { PageSpinner } from '@/components/ui';
import { LanguageSwitcher, ThemeToggle } from './Switchers';

/** Decorative row of souq arches with glowing lanterns. Pure SVG, no external art. */
function ArchSkyline() {
  const arches = [0, 1, 2, 3, 4];
  return (
    <svg viewBox="0 0 520 220" className="w-full" aria-hidden>
      <defs>
        <linearGradient id="archFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F2A93B" stopOpacity=".22" />
          <stop offset="1" stopColor="#F2A93B" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="lantern" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#FFD58A" />
          <stop offset=".45" stopColor="#F2A93B" stopOpacity=".7" />
          <stop offset="1" stopColor="#F2A93B" stopOpacity="0" />
        </radialGradient>
      </defs>
      {arches.map((i) => {
        const x = 12 + i * 100;
        const h = i === 2 ? 0 : i % 2 ? 18 : 34;
        return (
          <g key={i}>
            <path
              d={`M${x} 220V${110 + h}C${x} ${78 + h} ${x + 22} ${56 + h} ${x + 46} ${40 + h}C${x + 70} ${56 + h} ${x + 92} ${78 + h} ${x + 92} ${110 + h}V220`}
              fill="url(#archFill)"
              stroke="#F2A93B"
              strokeOpacity=".5"
              strokeWidth="1.5"
            />
            <line x1={x + 46} y1={40 + h - 30} x2={x + 46} y2={40 + h + 14} stroke="#F2A93B" strokeOpacity=".5" />
            <circle cx={x + 46} cy={40 + h + 26} r="16" fill="url(#lantern)" className="animate-glow" style={{ animationDelay: `${i * 0.6}s` }} />
            <rect x={x + 40} y={40 + h + 16} width="12" height="18" rx="4" fill="#F2A93B" />
          </g>
        );
      })}
    </svg>
  );
}

export function AuthLayout() {
  const { t } = useTranslation();
  const points = [
    { icon: BadgeCheck, text: t('authPanel.point1') },
    { icon: HandCoins, text: t('authPanel.point2') },
    { icon: Truck, text: t('authPanel.point3') },
  ];
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Brand panel — always rendered with dark tokens. */}
      <aside className="dark relative hidden overflow-hidden bg-[#0B2826] text-fg lg:flex lg:flex-col">
        <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_80%_10%,rgba(242,169,59,.22),transparent_60%),radial-gradient(80%_70%_at_0%_100%,rgba(14,94,90,.9),transparent_70%)]" />
        <div className="souq-pattern absolute inset-0 opacity-70 [mask-image:linear-gradient(180deg,#000,transparent_75%)]" />
        <div className="relative flex flex-1 flex-col justify-between p-10 xl:p-14">
          <Link to="/" aria-label={t('nav.home')} className="w-fit">
            <Logo markClassName="size-11" />
          </Link>
          <div className="max-w-lg">
            <p className="text-4xl font-extrabold leading-[1.1] tracking-tight text-ink-950 xl:text-5xl">
              <span className="latin">Every shop,</span>
              <br />
              <span className="latin text-accent">one souq.</span>
            </p>
            <p className="mt-3 w-fit font-arabic text-2xl font-semibold text-accent-700" lang="ar" dir="rtl">
              كل المتاجر، سوق واحد
            </p>
            <ul className="mt-8 space-y-3.5">
              {points.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm text-fg-muted">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/5 text-accent ring-1 ring-white/10">
                    <Icon className="size-[18px]" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <div className="-mx-2 -mb-10 xl:-mb-14">
            <ArchSkyline />
          </div>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <div className="flex items-center justify-between px-4 py-3 sm:px-8">
          <Link to="/" aria-label={t('nav.home')} className="lg:invisible">
            <Logo markClassName="size-9" />
          </Link>
          <div className="flex items-center gap-0.5">
            <LanguageSwitcher compact />
            <ThemeToggle />
          </div>
        </div>
        <main id="main" className="flex flex-1 items-start justify-center px-4 pb-10 pt-4 sm:items-center sm:px-8">
          <div className="w-full max-w-[420px] animate-fade-up">
            <Suspense fallback={<PageSpinner />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
        <footer className="flex flex-wrap justify-center gap-x-5 gap-y-1 px-4 pb-6 text-xs text-fg-subtle">
          <Link to="/terms" className="hover:text-fg">
            {t('footer.terms')}
          </Link>
          <Link to="/privacy" className="hover:text-fg">
            {t('footer.privacy')}
          </Link>
          <Link to="/help" className="hover:text-fg">
            {t('footer.help')}
          </Link>
        </footer>
      </div>
    </div>
  );
}
