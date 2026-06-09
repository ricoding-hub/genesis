import { useEffect, useState } from 'react';
import { useStore } from '@/state/store';
import { Dashboard } from './Dashboard';
import { EventsPanel } from './EventsPanel';
import { GeneticLab } from './GeneticLab';
import { GodMode } from './GodMode';
import { Inspector } from './Inspector';
import { Minimap } from './Minimap';
import { TimeControls } from './TimeControls';

function formatAge(seconds: number): string {
  const days = Math.floor(seconds / 90);
  return `Day ${days + 1}`;
}

function DayNightIcon({ phase }: { phase: number }) {
  // Sun arc: phase 0 dawn → 0.25 noon → 0.5 dusk → 0.75 midnight.
  const isNight = phase > 0.5;
  return (
    <span className="text-base leading-none" title={`Day phase ${(phase * 24).toFixed(0)}h`}>
      {isNight ? '🌙' : phase < 0.08 || phase > 0.42 ? '🌅' : '☀️'}
    </span>
  );
}

function HUD() {
  const snapshot = useStore((s) => s.snapshot);
  const dashboardOpen = useStore((s) => s.dashboardOpen);
  const setDashboardOpen = useStore((s) => s.setDashboardOpen);
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  if (!snapshot) return null;
  return (
    <div className="glass absolute top-3 left-1/2 -translate-x-1/2 px-4 py-2 flex items-center gap-4 text-sm animate-fade-in">
      <DayNightIcon phase={snapshot.dayPhase} />
      <span className="font-mono text-slate-300">{formatAge(snapshot.worldAge)}</span>
      <span className="text-slate-500">|</span>
      <span title="Living creatures">
        <span className="text-emerald-300 font-semibold font-mono">{snapshot.population}</span>
        <span className="text-slate-400 text-xs ml-1">alive</span>
      </span>
      <span title="Highest generation born">
        <span className="text-sky-300 font-semibold font-mono">{snapshot.generation}</span>
        <span className="text-slate-400 text-xs ml-1">gen</span>
      </span>
      <span title="Living species">
        <span className="text-fuchsia-300 font-semibold font-mono">
          {snapshot.species.filter((sp) => sp.population > 0).length}
        </span>
        <span className="text-slate-400 text-xs ml-1">species</span>
      </span>
      <span className="text-slate-500">|</span>
      <span className="font-mono text-xs text-slate-400" title="Frames per second">
        {snapshot.fps} fps
      </span>
      <button
        className={`btn ${dashboardOpen ? 'btn-active' : ''}`}
        onClick={() => setDashboardOpen(!dashboardOpen)}
        title="Evolution dashboard (D)"
      >
        📊 Stats
      </button>
      <button className="btn" onClick={() => setHelpOpen(true)} title="Help & shortcuts">
        ?
      </button>
    </div>
  );
}

/** First-run hint that fades away; subtle discoverability per the spec. */
function FirstRunHint() {
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
    const t = setTimeout(() => setVisible(false), 14000);
    return () => clearTimeout(t);
  }, [visible]);
  if (!visible) return null;
  return (
    <div className="glass absolute top-16 left-1/2 -translate-x-1/2 px-4 py-2 text-xs text-slate-300 animate-fade-in flex items-center gap-3">
      <span>🌱 Life has been seeded — evolution is already running.</span>
      <span className="text-slate-500">
        Drag to pan · scroll to zoom · <kbd className="text-emerald-300">G</kbd> god mode ·{' '}
        <kbd className="text-emerald-300">L</kbd> lab
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

/** Mobile gets a simplified nudge — the sim is desktop-first. */
function MobileNudge() {
  const [dismissed, setDismissed] = useState(false);
  const small = typeof window !== 'undefined' && window.innerWidth < 768;
  if (!small || dismissed) return null;
  return (
    <div
      className="absolute inset-0 bg-black/70 flex items-center justify-center p-6"
      style={{ pointerEvents: 'auto' }}
    >
      <div className="glass p-6 max-w-sm text-center">
        <div className="text-3xl mb-2">🌍</div>
        <h2 className="font-semibold mb-2">GENESIS is best on desktop</h2>
        <p className="text-xs text-slate-400 mb-4">
          The full ecosystem simulation, god tools and dashboards need a big screen and a mouse.
          You can still watch the world evolve here.
        </p>
        <button className="btn w-full" onClick={() => setDismissed(true)}>
          Watch anyway
        </button>
      </div>
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
  const helpOpen = useStore((s) => s.helpOpen);
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  if (!helpOpen) return null;
  const rows: [string, string][] = [
    ['Space', 'Pause / play'],
    ['+ / -', 'Change simulation speed'],
    ['.', 'Step one tick (while paused)'],
    ['G', 'Toggle God Mode toolbar'],
    ['L', 'Open the Genetic Lab'],
    ['M', 'Toggle minimap'],
    ['D', 'Toggle evolution dashboard'],
    ['Esc', 'Deselect tool / close panels'],
    ['Drag', 'Pan the world'],
    ['Scroll', 'Zoom'],
    ['Click a creature', 'Inspect its genome'],
  ];
  return (
    <div
      className="absolute inset-0 bg-black/50 flex items-center justify-center animate-fade-in"
      style={{ pointerEvents: 'auto' }}
      onClick={() => setHelpOpen(false)}
    >
      <div className="glass p-6 w-[420px]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-1">GENESIS</h2>
        <p className="text-xs text-slate-400 mb-4">
          A living ecosystem. Creatures eat, reproduce, mutate and die — natural selection does
          the rest. Intervene as a god, or just watch evolution unfold.
        </p>
        <div className="grid grid-cols-[90px_1fr] gap-y-1.5 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <span className="font-mono text-emerald-300 text-xs pt-0.5">{k}</span>
              <span className="text-slate-300 text-xs pt-0.5">{v}</span>
            </div>
          ))}
        </div>
        <button className="btn mt-5 w-full" onClick={() => setHelpOpen(false)}>
          Close
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
      <GeneticLab />
      <Inspector />
      <Toast />
      <FirstRunHint />
      <Help />
      <MobileNudge />
    </>
  );
}
