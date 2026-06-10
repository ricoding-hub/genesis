import { useTranslation } from 'react-i18next';
import { useStore } from '@/state/store';
import { Era, ERA_ICONS, TribeInfo } from '@/types';

const ERA_KEYS: Record<Era, string> = {
  [Era.Stone]: 'stone',
  [Era.Fire]: 'fire',
  [Era.Tools]: 'tools',
  [Era.Agriculture]: 'agriculture',
  [Era.Faith]: 'faith',
  [Era.Writing]: 'writing',
};

function EraTrack({ era }: { era: Era }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1">
      {([Era.Stone, Era.Fire, Era.Tools, Era.Agriculture, Era.Faith, Era.Writing] as Era[]).map(
        (e) => (
          <span
            key={e}
            title={t(`era.${ERA_KEYS[e]}`)}
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
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="w-3.5 h-3.5 rounded-full border border-white/30 shrink-0"
          style={{ background: tribe.color }}
        />
        <span className="text-sm font-semibold truncate">{tribe.name}</span>
        {tribe.hasTemple && <span title="temple">🏛️</span>}
        <span className="text-xs text-slate-400 ml-auto font-mono">{tribe.population}👤</span>
      </div>
      <div className="flex items-center justify-between mb-1.5">
        <EraTrack era={tribe.era} />
        <span className="text-[10px] text-slate-400">
          {ERA_ICONS[tribe.era]} {t(`era.${ERA_KEYS[tribe.era]}`)}
        </span>
      </div>
      <div className="h-1.5 rounded bg-white/10 mb-1.5">
        <div
          className="h-full rounded transition-all"
          style={{ width: `${(tribe.eraProgress * 100).toFixed(0)}%`, background: tribe.color }}
        />
      </div>
      {/* Divine favor toward you. */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] text-slate-400 w-10">{t('civ.favor')}</span>
        <div className="flex-1 h-1.5 rounded bg-white/10">
          <div
            className="h-full rounded transition-all"
            style={{
              width: `${tribe.favor.toFixed(0)}%`,
              background:
                tribe.favor > 65 ? '#ffd24a' : tribe.favor < 35 ? '#ef5d5d' : '#9aa4b2',
            }}
          />
        </div>
        <span className="text-[9px] font-mono text-slate-500">{tribe.favor.toFixed(0)}</span>
      </div>
      <div className="flex items-center gap-3 text-[10px] text-slate-400">
        {tribe.deity ? (
          <span>⛩️ {tribe.deity}</span>
        ) : (
          <span className="opacity-50">{t('civ.noFaith')}</span>
        )}
        {tribe.explorers > 0 && <span>🚩 {tribe.explorers}</span>}
        <span className="ml-auto font-mono">{tribe.knowledge.toFixed(0)} 🧠</span>
      </div>
    </div>
  );
}

export function CivSection() {
  const { t } = useTranslation();
  const snapshot = useStore((s) => s.snapshot);
  if (!snapshot) return null;

  const { tribes, civLog } = snapshot;

  return (
    <div>
      {tribes.length === 0 ? (
        <div className="text-xs text-slate-400 leading-relaxed">{t('civ.none')}</div>
      ) : (
        <div className="flex flex-col gap-2 mb-4">
          {tribes.map((tr) => (
            <TribeCard key={tr.id} tribe={tr} />
          ))}
        </div>
      )}

      <div className="panel-title mb-2">{t('civ.chronicle')}</div>
      <div className="flex flex-col gap-1">
        {civLog.length === 0 ? (
          <div className="text-[11px] text-slate-500">{t('civ.empty')}</div>
        ) : (
          civLog.map((m, i) => (
            <div key={`${m.t}-${i}`} className="flex items-start gap-2 text-[11px]">
              <span className="shrink-0">{m.icon}</span>
              <span className="text-slate-300">{t(`milestone.${m.key}`, m.params)}</span>
              <span className="text-slate-500 font-mono ml-auto shrink-0">
                {t('civ.days', { n: Math.floor(m.t / 90) + 1 })}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
