import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '@/i18n';
import { useStore } from '@/state/store';
import { CivSection } from './CivilizationPanel';
import { ConfirmModal } from './ConfirmModal';
import { DashboardSection } from './Dashboard';
import { ActiveEvents, EventsSection } from './EventsPanel';
import { GeneticLab } from './GeneticLab';
import { GodSection } from './GodMode';
import { Inspector } from './Inspector';
import { Menu } from './Menu';
import { Minimap } from './Minimap';
import { MobileNav } from './MobileNav';
import { Panel } from './Panel';
import { ScenarioModal } from './ScenarioModal';
import { TimeControls } from './TimeControls';
import { VersusSection } from './VersusPanel';
import { useIsMobile } from './useIsMobile';

function DayNightIcon({ phase }: { phase: number }) {
  const isNight = phase > 0.5;
  return (
    <span className="text-base leading-none">
      {isNight ? '🌙' : phase < 0.08 || phase > 0.42 ? '🌅' : '☀️'}
    </span>
  );
}

/** Live stats. On mobile it's a full-width top bar with a small utility
 *  cluster on the right (world / language / help); on desktop, stats only. */
function HUD() {
  const { t, i18n } = useTranslation();
  const snapshot = useStore((s) => s.snapshot);
  const setScenarioOpen = useStore((s) => s.setScenarioOpen);
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  if (!snapshot) return null;
  return (
    <div className="glass absolute top-3 left-3 max-md:top-2 max-md:left-2 max-md:right-2 px-3 py-2 max-md:px-2.5 max-md:py-1.5 flex items-center gap-2.5 md:gap-3 text-xs md:text-sm animate-fade-in z-20">
      <DayNightIcon phase={snapshot.dayPhase} />
      <span className="font-mono text-slate-300">
        {t('hud.day', { n: Math.floor(snapshot.worldAge / 90) + 1 })}
      </span>
      <span className="text-slate-500 hidden sm:inline">·</span>
      <span>
        <span className="text-emerald-300 font-semibold font-mono">{snapshot.population}</span>
        <span className="text-slate-400 text-xs ml-1 hidden sm:inline">{t('hud.alive')}</span>
      </span>
      <span>
        <span className="text-sky-300 font-semibold font-mono">{snapshot.generation}</span>
        <span className="text-slate-400 text-xs ml-1 hidden sm:inline">{t('hud.gen')}</span>
      </span>
      <span className="hidden md:inline">
        <span className="text-fuchsia-300 font-semibold font-mono">
          {snapshot.species.filter((sp) => sp.population > 0).length}
        </span>
        <span className="text-slate-400 text-xs ml-1">{t('hud.species')}</span>
      </span>
      <span className="font-mono text-xs text-slate-500 hidden md:inline">
        {snapshot.fps} {t('hud.fps')}
      </span>

      {/* Mobile-only utility cluster, pushed to the right edge. */}
      <div className="md:hidden ml-auto flex items-center gap-1">
        <button className="btn !px-2 !py-1" onClick={() => setScenarioOpen(true)} title={t('menu.world')}>
          🌍
        </button>
        <button
          className="btn !px-2 !py-1 font-semibold"
          onClick={() => setLanguage(i18n.language === 'es' ? 'en' : 'es')}
          title={t('lang.switch')}
        >
          {i18n.language === 'es' ? 'ES' : 'EN'}
        </button>
        <button className="btn !px-2 !py-1" onClick={() => setHelpOpen(true)} title={t('menu.help')}>
          ?
        </button>
      </div>
    </div>
  );
}

/** Renders the single active docked panel (god / events / stats / civ / versus). */
function PanelHost() {
  const { t } = useTranslation();
  const panel = useStore((s) => s.panel);
  switch (panel) {
    case 'god':
      return (
        <Panel icon="✨" title={t('god.title')}>
          <GodSection />
        </Panel>
      );
    case 'events':
      return (
        <Panel icon="☄️" title={t('events.title')}>
          <EventsSection />
        </Panel>
      );
    case 'stats':
      return (
        <Panel icon="📊" title={t('dashboard.title')}>
          <DashboardSection />
        </Panel>
      );
    case 'civ':
      return (
        <Panel icon="🏛️" title={t('civ.title')}>
          <CivSection />
        </Panel>
      );
    case 'versus':
      return (
        <Panel icon="⚔️" title={t('versus.title')}>
          <VersusSection />
        </Panel>
      );
    default:
      return null;
  }
}

function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="glass absolute bottom-20 max-md:bottom-[160px] left-1/2 -translate-x-1/2 px-4 py-2 text-sm text-slate-200 animate-slide-up z-30 text-center max-w-[90vw]">
      {toast}
    </div>
  );
}

/** First-run hint that fades away; subtle discoverability per the spec. */
function FirstRunHint() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [visible, setVisible] = useState(() => {
    try {
      return !localStorage.getItem('genesis-visited');
    } catch {
      return true;
    }
  });
  useEffect(() => {
    if (!visible) return;
    try {
      localStorage.setItem('genesis-visited', '1');
    } catch {
      /* private mode */
    }
    const id = setTimeout(() => setVisible(false), 12000);
    return () => clearTimeout(id);
  }, [visible]);
  if (!visible) return null;
  return (
    <div className="glass absolute bottom-32 max-md:bottom-[208px] left-1/2 -translate-x-1/2 px-4 py-2 text-xs text-slate-300 animate-fade-in flex items-center gap-3 max-w-[92vw] z-20">
      <span>{t('firstRun.seeded')}</span>
      <span className="text-slate-500 hidden sm:inline">
        {isMobile ? t('firstRun.mobileHints') : t('firstRun.desktopHints', { g: 'G', l: 'L' })}
      </span>
      <button
        className="text-slate-500 hover:text-white shrink-0"
        style={{ pointerEvents: 'auto' }}
        onClick={() => setVisible(false)}
      >
        ✕
      </button>
    </div>
  );
}

function Help() {
  const { t } = useTranslation();
  const helpOpen = useStore((s) => s.helpOpen);
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  if (!helpOpen) return null;
  const rows: [string, string][] = [
    ['Drag', t('help.drag')],
    ['Pinch / scroll', t('help.pinchZoom')],
    ['Tap', t('help.tapCreature')],
    ['Space', t('help.space')],
    ['+ / -', t('help.speedKeys')],
    ['.', t('help.stepKey')],
    ['G', t('help.god')],
    ['L', t('help.lab')],
    ['M', t('help.minimap')],
    ['D', t('help.dashboard')],
    ['C', t('help.civ')],
    ['Esc', t('help.esc')],
  ];
  return (
    <div
      className="absolute inset-0 z-40 bg-black/50 flex items-center justify-center animate-fade-in p-4"
      style={{ pointerEvents: 'auto' }}
      onClick={() => setHelpOpen(false)}
    >
      <div className="glass p-6 w-[420px] max-w-full" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-1">{t('help.title')}</h2>
        <p className="text-xs text-slate-400 mb-4">{t('help.intro')}</p>
        <div className="grid grid-cols-[110px_1fr] gap-y-1.5 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <span className="font-mono text-emerald-300 text-xs pt-0.5">{k}</span>
              <span className="text-slate-300 text-xs pt-0.5">{v}</span>
            </div>
          ))}
        </div>
        <button className="btn mt-5 w-full py-2" onClick={() => setHelpOpen(false)}>
          {t('help.close')}
        </button>
      </div>
    </div>
  );
}

export function App() {
  return (
    <>
      <HUD />
      <Menu />
      <MobileNav />
      <ActiveEvents />
      <PanelHost />
      <Inspector />
      <Minimap />
      <TimeControls />
      <Toast />
      <FirstRunHint />
      <GeneticLab />
      <Help />
      <ScenarioModal />
      <ConfirmModal />
    </>
  );
}
