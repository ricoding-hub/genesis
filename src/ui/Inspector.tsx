import { useTranslation } from 'react-i18next';
import { getEngine } from '@/engine/engine';
import { useStore } from '@/state/store';
import { ERA_ICONS, Era, Genes } from '@/types';

const TRAITS: (keyof Genes)[] = [
  'speed',
  'size',
  'vision',
  'diet',
  'efficiency',
  'reproThreshold',
  'mutationRate',
  'lifespan',
  'nocturnal',
];

const ERA_KEYS: Record<Era, string> = {
  [Era.Stone]: 'stone',
  [Era.Fire]: 'fire',
  [Era.Tools]: 'tools',
  [Era.Agriculture]: 'agriculture',
  [Era.Faith]: 'faith',
  [Era.Writing]: 'writing',
};

export function Inspector() {
  const { t } = useTranslation();
  const info = useStore((s) => s.selected);
  const setSelected = useStore((s) => s.setSelected);
  if (!info) return null;

  const energyPct = Math.round((info.energy / info.maxEnergy) * 100);
  const agePct = Math.round((info.age / info.lifespan) * 100);

  return (
    <div className="glass absolute bottom-4 left-3 w-64 max-md:left-[64px] max-md:right-2 max-md:w-auto max-md:bottom-[84px] p-3 animate-slide-up">
      <div className="flex items-center gap-2 mb-2">
        <span
          className="w-3.5 h-3.5 rounded-full border border-white/30"
          style={{ background: info.speciesColor }}
        />
        <span className="text-xs font-semibold">
          {t(`archetype.${info.archetype}`)} {info.sex === 'M' ? '♂' : '♀'} #{info.id}
        </span>
        <button
          className="btn ml-auto !px-1.5 !py-0.5"
          onClick={() => {
            getEngine().renderer.selected = null;
            setSelected(null);
          }}
        >
          ✕
        </button>
      </div>

      <div className="text-[10px] text-slate-400 mb-2 flex gap-3">
        <span>{t(`stage.${info.stage}`)}</span>
        <span>{t('inspector.gen', { n: info.generation })}</span>
        <span>{t('inspector.offspring', { n: info.children })}</span>
      </div>

      {info.tribeName && (
        <div className="text-[10px] mb-2 rounded-md border border-amber-400/20 bg-amber-400/5 px-2 py-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
          <span className="text-amber-200">{info.tribeName}</span>
          {info.tribeEra !== null && (
            <span className="text-slate-300">
              {ERA_ICONS[info.tribeEra]} {t(`era.${ERA_KEYS[info.tribeEra]}`)}
            </span>
          )}
          {info.deity && (
            <span className="text-slate-400">⛩️ {t('inspector.worships', { deity: info.deity })}</span>
          )}
          {info.explorer && <span className="text-sky-300">🚩 {t('inspector.explorer')}</span>}
        </div>
      )}

      <div className="mb-1 text-[10px] text-slate-400 flex justify-between">
        <span>{t('inspector.energy')}</span>
        <span className="font-mono">{energyPct}%</span>
      </div>
      <div className="h-1.5 rounded bg-white/10 mb-2">
        <div
          className="h-full rounded bg-emerald-400 transition-all"
          style={{ width: `${energyPct}%` }}
        />
      </div>
      <div className="mb-1 text-[10px] text-slate-400 flex justify-between">
        <span>{t('inspector.age')}</span>
        <span className="font-mono">{agePct}%</span>
      </div>
      <div className="h-1.5 rounded bg-white/10 mb-3">
        <div
          className="h-full rounded bg-amber-400 transition-all"
          style={{ width: `${agePct}%` }}
        />
      </div>

      <div className="grid grid-cols-1 gap-1">
        {TRAITS.map((key) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 w-16">{t(`gene.${key}`)}</span>
            <div className="flex-1 h-1 rounded bg-white/10">
              <div
                className="h-full rounded"
                style={{
                  width: `${(info.genes[key] * 100).toFixed(0)}%`,
                  background: info.speciesColor,
                }}
              />
            </div>
            <span className="text-[9px] font-mono text-slate-500 w-7 text-right">
              {info.genes[key].toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
