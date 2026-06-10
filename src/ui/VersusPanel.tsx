import { useTranslation } from 'react-i18next';
import { getEngine } from '@/engine/engine';
import { useStore } from '@/state/store';
import { Era, ERA_ICONS, VersusMatchup, VersusSideStats } from '@/types';

const MATCHUPS: VersusMatchup[] = ['menVsWomen', 'smartVsStrong', 'nightVsDay', 'herbVsCarn'];

function Bar({ label, a, b, max }: { label: string; a: number; b: number; max: number }) {
  const ap = max > 0 ? (a / max) * 100 : 0;
  const bp = max > 0 ? (b / max) * 100 : 0;
  return (
    <div className="mb-1.5">
      <div className="text-[9px] text-slate-400 text-center mb-0.5">{label}</div>
      <div className="flex items-center gap-1">
        <div className="flex-1 h-2 rounded bg-white/10 flex justify-end overflow-hidden">
          <div className="h-full rounded-l" style={{ width: `${ap}%`, background: '#5fa8ff' }} />
        </div>
        <span className="text-[9px] font-mono text-slate-300 w-14 text-center">
          {a.toFixed(a < 10 ? 1 : 0)} · {b.toFixed(b < 10 ? 1 : 0)}
        </span>
        <div className="flex-1 h-2 rounded bg-white/10 overflow-hidden">
          <div className="h-full rounded-r" style={{ width: `${bp}%`, background: '#ff6f91' }} />
        </div>
      </div>
    </div>
  );
}

function Side({ s, name, align }: { s: VersusSideStats; name: string; align: string }) {
  const { t } = useTranslation();
  return (
    <div className={`flex-1 ${align}`}>
      <div className="text-sm font-semibold" style={{ color: s.color }}>
        {name}
      </div>
      <div className="text-[10px] text-slate-400">
        {ERA_ICONS[s.era as Era]} {t(`era.${['stone', 'fire', 'tools', 'agriculture', 'faith', 'writing'][s.era]}`)}
      </div>
    </div>
  );
}

export function VersusSection() {
  const { t } = useTranslation();
  const snapshot = useStore((s) => s.snapshot);
  const askConfirm = useStore((s) => s.askConfirm);
  const { sim } = getEngine();
  const versus = snapshot?.versus;

  // Setup screen when no versus is running.
  if (!versus || !versus.active) {
    return (
      <div>
        <div className="panel-title mb-2">{t('versus.setup')}</div>
        <div className="flex flex-col gap-1.5">
          {MATCHUPS.map((m) => (
            <button
              key={m}
              className="btn text-left py-2.5"
              onClick={() => {
                sim.startVersus(m);
                sim.paused = false;
              }}
            >
              {t(`versus.${m}`)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const { left, right } = versus;
  const maxPop = Math.max(left.population, right.population, 1);
  const maxKnow = Math.max(left.knowledge, right.knowledge, 1);

  return (
    <div>
      <div className="text-xs font-semibold text-center mb-3">{t(`versus.${versus.matchup}`)}</div>
      <div className="flex items-center mb-3">
        <Side s={left} name={t('versus.left')} align="text-left" />
        <span className="text-slate-500 text-xs px-2">VS</span>
        <Side s={right} name={t('versus.right')} align="text-right" />
      </div>
      <Bar label={t('versus.population')} a={left.population} b={right.population} max={maxPop} />
      <Bar label={t('versus.knowledge')} a={left.knowledge} b={right.knowledge} max={maxKnow} />
      <Bar label={t('versus.avgSize')} a={left.avgSize} b={right.avgSize} max={1} />
      <Bar label={t('versus.avgIntel')} a={left.avgIntel} b={right.avgIntel} max={1} />
      <button
        className="btn btn-danger w-full mt-4 py-2.5"
        onClick={() =>
          askConfirm({
            titleKey: 'confirm.endVersusTitle',
            bodyKey: 'confirm.endVersusBody',
            confirmKey: 'confirm.endVersusYes',
            danger: true,
            onConfirm: () => sim.endVersus(),
          })
        }
      >
        {t('versus.end')}
      </button>
    </div>
  );
}
