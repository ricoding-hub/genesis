import { useStore } from '@/state/store';
import { Era, ERA_ICONS, ERA_NAMES, TribeInfo } from '@/types';

function EraTrack({ era }: { era: Era }) {
  // A little 6-dot progression so the age reads at a glance.
  return (
    <div className="flex items-center gap-1">
      {([Era.Stone, Era.Fire, Era.Tools, Era.Agriculture, Era.Faith, Era.Writing] as Era[]).map(
        (e) => (
          <span
            key={e}
            title={ERA_NAMES[e]}
            className="text-[11px] leading-none"
            style={{ opacity: e <= era ? 1 : 0.22, filter: e <= era ? 'none' : 'grayscale(1)' }}
          >
            {ERA_ICONS[e]}
          </span>
        ),
      )}
    </div>
  );
}

function TribeCard({ tribe }: { tribe: TribeInfo }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="w-3.5 h-3.5 rounded-full border border-white/30 shrink-0"
          style={{ background: tribe.color }}
        />
        <span className="text-sm font-semibold truncate">{tribe.name}</span>
        <span className="text-xs text-slate-400 ml-auto font-mono">{tribe.population}👤</span>
      </div>
      <div className="flex items-center justify-between mb-1.5">
        <EraTrack era={tribe.era} />
        <span className="text-[10px] text-slate-400">
          {ERA_ICONS[tribe.era]} {ERA_NAMES[tribe.era]}
        </span>
      </div>
      <div className="h-1.5 rounded bg-white/10 mb-1.5" title="Progress to next age">
        <div
          className="h-full rounded transition-all"
          style={{ width: `${(tribe.eraProgress * 100).toFixed(0)}%`, background: tribe.color }}
        />
      </div>
      <div className="flex items-center gap-3 text-[10px] text-slate-400">
        {tribe.deity ? (
          <span title="Worshipped deity">⛩️ {tribe.deity}</span>
        ) : (
          <span className="opacity-50">no faith yet</span>
        )}
        {tribe.explorers > 0 && <span title="Explorers afield">🚩 {tribe.explorers}</span>}
        <span className="ml-auto font-mono">{tribe.knowledge.toFixed(0)} 🧠</span>
      </div>
    </div>
  );
}

export function CivilizationPanel() {
  const open = useStore((s) => s.civOpen);
  const setOpen = useStore((s) => s.setCivOpen);
  const snapshot = useStore((s) => s.snapshot);
  if (!open || !snapshot) return null;

  const { tribes, civLog } = snapshot;

  return (
    <div className="glass absolute right-3 top-16 bottom-20 w-[360px] max-md:left-2 max-md:right-2 max-md:top-12 max-md:bottom-16 max-md:w-auto p-4 overflow-y-auto thin-scroll animate-slide-up">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">🏛️ Civilization</h2>
        <button className="btn" onClick={() => setOpen(false)}>
          ✕
        </button>
      </div>

      {tribes.length === 0 ? (
        <div className="text-xs text-slate-400 leading-relaxed">
          No tribe has awakened yet. Humanoids must survive and gather before the{' '}
          <span className="text-amber-300">Spark of Sapience</span> ignites — or use the{' '}
          <span className="text-emerald-300">🛖 Found tribe</span> god tool to settle one now.
        </div>
      ) : (
        <div className="flex flex-col gap-2 mb-4">
          {tribes.map((t) => (
            <TribeCard key={t.id} tribe={t} />
          ))}
        </div>
      )}

      <div className="panel-title mb-2">Chronicle</div>
      <div className="flex flex-col gap-1">
        {civLog.length === 0 ? (
          <div className="text-[11px] text-slate-500">History has yet to be written…</div>
        ) : (
          civLog.map((m, i) => (
            <div key={`${m.t}-${i}`} className="flex items-start gap-2 text-[11px]">
              <span className="shrink-0">{m.icon}</span>
              <span className="text-slate-300">{m.text}</span>
              <span className="text-slate-500 font-mono ml-auto shrink-0">
                {Math.floor(m.t / 90) + 1}d
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
