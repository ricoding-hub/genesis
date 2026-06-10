import { useTranslation } from 'react-i18next';
import { getEngine } from '@/engine/engine';
import { useStore } from '@/state/store';
import { Scenario } from '@/types';

const SCENARIOS: { id: Scenario; icon: string }[] = [
  { id: 'genesis', icon: '🌱' },
  { id: 'advanced', icon: '🏛️' },
  { id: 'arena', icon: '⚔️' },
];

export function ScenarioModal() {
  const { t } = useTranslation();
  const open = useStore((s) => s.scenarioOpen);
  const setOpen = useStore((s) => s.setScenarioOpen);
  const setPanel = useStore((s) => s.setPanel);
  const askConfirm = useStore((s) => s.askConfirm);
  const { sim } = getEngine();

  if (!open) return null;

  const choose = (id: Scenario) => {
    askConfirm({
      titleKey: 'confirm.restartTitle',
      bodyKey: 'confirm.restartBody',
      confirmKey: 'confirm.restartYes',
      danger: true,
      onConfirm: () => {
        sim.reset(id);
        sim.paused = false;
        setOpen(false);
        setPanel(id === 'arena' ? 'versus' : 'none');
      },
    });
  };

  return (
    <div
      className="absolute inset-0 z-30 bg-black/60 flex items-center justify-center p-4 animate-fade-in"
      style={{ pointerEvents: 'auto' }}
      onClick={() => setOpen(false)}
    >
      <div className="glass p-6 w-[560px] max-w-[94vw]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold">{t('scenario.title')}</h2>
          <button className="btn" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-4">{t('scenario.subtitle')}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/15 hover:border-emerald-400/40 p-4 text-left transition-colors"
              style={{ pointerEvents: 'auto' }}
              onClick={() => choose(s.id)}
            >
              <div className="text-3xl mb-2">{s.icon}</div>
              <div className="text-sm font-semibold mb-1">{t(`scenario.${s.id}`)}</div>
              <div className="text-[11px] text-slate-400 leading-snug">
                {t(`scenario.${s.id}Desc`)}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
