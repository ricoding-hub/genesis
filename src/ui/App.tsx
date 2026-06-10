import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ERA_ICONS } from '@/types';
import { setLanguage } from '@/i18n';
import { useStore } from '@/state/store';
import { CivilizationPanel } from './CivilizationPanel';
import { useIsMobile } from './useIsMobile';
import { Dashboard } from './Dashboard';
import { EventsPanel } from './EventsPanel';
import { GeneticLab } from './GeneticLab';
import { GodMode } from './GodMode';
import { Inspector } from './Inspector';
import { Minimap } from './Minimap';
import { ScenarioModal } from './ScenarioModal';
import { TimeControls } from './TimeControls';
import { VersusPanel } from './VersusPanel';

function DayNightIcon({ phase }: { phase: number }) {
  // Sun arc: phase 0 dawn → 0.25 noon → 0.5 dusk → 0.75 midnight.
  const isNight = phase > 0.5;
  return (
    <span className="text-base leading-none">
      {isNight ? '🌙' : phase < 0.08 || phase > 0.42 ? '🌅' : '☀️'}
    </span>
  );
}

function LanguageToggle() {
  const { i18n } = useTranslation();
  const next = i18n.language === 'es' ? 'en' : 'es';
  return (
    <button
      className="btn"
      onClick={() => setLanguage(next)}
      title={i18n.t('lang.switch')}
    >
      {i18n.language === 'es' ? '🇪🇸' : '🇬🇧'}
    </button>
  );
}

function HUD() {
  const { t } = useTranslation();
  const snapshot = useStore((s) => s.snapshot);
  const dashboardOpen = useStore((s) => s.dashboardOpen);
  const setDashboardOpen = useStore((s) => s.setDashboardOpen);
  const civOpen = useStore((s) => s.civOpen);
  const setCivOpen = useStore((s) => s.setCivOpen);
  const versusOpen = useStore((s) => s.versusOpen);
  const setVersusOpen = useStore((s) => s.setVersusOpen);
  const setScenarioOpen = useStore((s) => s.setScenarioOpen);
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  if (!snapshot) return null;
  // Most advanced living tribe drives the civilization chip.
  const topTribe = [...snapshot.tribes].sort((a, b) => b.era - a.era)[0];
  return (
    <div className="glass absolute top-2 md:top-3 left-1/2 -translate-x-1/2 px-2.5 md:px-4 py-1.5 md:py-2 flex items-center gap-2 md:gap-3 text-xs md:text-sm animate-fade-in max-w-[97vw] whitespace-nowrap">
      <DayNightIcon phase={snapshot.dayPhase} />
      <span className="font-mono text-slate-300">{t('hud.day', { n: Math.floor(snapshot.worldAge / 90) + 1 })}</span>
      <span className="text-slate-500 hidden md:inline">|</span>
      <span>
        <span className="text-emerald-300 font-semibold font-mono">{snapshot.population}</span>
        <span className="text-slate-400 text-xs ml-1">{t('hud.alive')}</span>
      </span>
      <span>
        <span className="text-sky-300 font-semibold font-mono">{snapshot.generation}</span>
        <span className="text-slate-400 text-xs ml-1">{t('hud.gen')}</span>
      </span>
      <span className="hidden sm:inline">
        <span className="text-fuchsia-300 font-semibold font-mono">
          {snapshot.species.filter((sp) => sp.population > 0).length}
        </span>
        <span className="text-slate-400 text-xs ml-1">{t('hud.species')}</span>
      </span>
      <span className="text-slate-500 hidden md:inline">|</span>
      <span className="font-mono text-xs text-slate-400 hidden md:inline">{snapshot.fps} {t('hud.fps')}</span>
      <button
        className={`btn ${dashboardOpen ? 'btn-active' : ''}`}
        onClick={() => setDashboardOpen(!dashboardOpen)}
      >
        📊<span className="hidden md:inline"> {t('hud.stats')}</span>
      </button>
      <button className={`btn ${civOpen ? 'btn-active' : ''}`} onClick={() => setCivOpen(!civOpen)}>
        {topTribe ? ERA_ICONS[topTribe.era] : '🏛️'}
        <span className="hidden md:inline"> {t('hud.civ')}</span>
      </button>
      <button
        className={`btn ${versusOpen ? 'btn-active' : ''}`}
        onClick={() => setVersusOpen(!versusOpen)}
        title={t('versus.title')}
      >
        ⚔️
      </button>
      <button className="btn" onClick={() => setScenarioOpen(true)} title={t('scenario.restart')}>
        🌍
      </button>
      <LanguageToggle />
      <button className="btn hidden md:block" onClick={() => setHelpOpen(true)} title={t('hud.help')}>
        ?
      </button>
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
    const id = setTimeout(() => setVisible(false), 14000);
    return () => clearTimeout(id);
  }, [visible]);
  if (!visible) return null;
  return (
    <div className="glass absolute top-14 md:top-16 left-1/2 -translate-x-1/2 px-4 py-2 text-xs text-slate-300 animate-fade-in flex items-center gap-3 max-w-[94vw] max-md:max-w-[62vw]">
      <span>{t('firstRun.seeded')}</span>
      <span className="text-slate-500 hidden sm:inline">
        {isMobile ? t('firstRun.mobileHints') : t('firstRun.desktopHints', { g: 'G', l: 'L' })}
      </span>
      <button
        className="text-slate-500 hover:text-white"
        style={{ pointerEvents: 'auto' }}
        onClick={() => setVisible(false)}
      >
        ✕
      </button>
    </div>
  );
}

function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="glass absolute bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 text-sm text-slate-200 animate-slide-up">
      {toast}
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
      className="absolute inset-0 bg-black/50 flex items-center justify-center animate-fade-in"
      style={{ pointerEvents: 'auto' }}
      onClick={() => setHelpOpen(false)}
    >
      <div className="glass p-6 w-[420px]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-1">{t('help.title')}</h2>
        <p className="text-xs text-slate-400 mb-4">{t('help.intro')}</p>
        <div className="grid grid-cols-[100px_1fr] gap-y-1.5 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <span className="font-mono text-emerald-300 text-xs pt-0.5">{k}</span>
              <span className="text-slate-300 text-xs pt-0.5">{v}</span>
            </div>
          ))}
        </div>
        <button className="btn mt-5 w-full" onClick={() => setHelpOpen(false)}>
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
      <GodMode />
      <EventsPanel />
      <TimeControls />
      <Minimap />
      <Dashboard />
      <CivilizationPanel />
      <VersusPanel />
      <GeneticLab />
      <Inspector />
      <Toast />
      <FirstRunHint />
      <Help />
      <ScenarioModal />
    </>
  );
}
