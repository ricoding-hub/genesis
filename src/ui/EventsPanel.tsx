import { useTranslation } from 'react-i18next';
import { getEngine } from '@/engine/engine';
import { useStore } from '@/state/store';
import { EventType } from '@/types';

const EVENTS: { id: EventType; icon: string }[] = [
  { id: 'meteor', icon: '☄️' },
  { id: 'iceage', icon: '🧊' },
  { id: 'wildfire', icon: '🔥' },
  { id: 'plague', icon: '🦠' },
  { id: 'drought', icon: '🌵' },
  { id: 'flood', icon: '🌊' },
  { id: 'earthquake', icon: '🫨' },
  { id: 'volcano', icon: '🌋' },
  { id: 'locust', icon: '🦗' },
  { id: 'eclipse', icon: '🌑' },
  { id: 'bloom', icon: '🌸' },
];

export function EventsPanel() {
  const { t } = useTranslation();
  const snapshot = useStore((s) => s.snapshot);
  const showToast = useStore((s) => s.showToast);
  const active = snapshot?.activeEvents ?? [];
  const { sim } = getEngine();

  return (
    <div className="absolute right-2 md:right-3 top-12 md:top-3 flex flex-col gap-2 items-end">
      <div className="glass px-2 md:px-2.5 py-1.5 md:py-2 flex flex-wrap gap-1.5 max-w-[58vw] md:max-w-none justify-end animate-fade-in">
        {EVENTS.map((e) => {
          const isActive = active.some((a) => a.type === e.id);
          return (
            <button
              key={e.id}
              className={`btn btn-danger ${isActive ? 'btn-active animate-pulse-soft' : ''}`}
              onClick={() => {
                sim.triggerEvent(e.id);
                showToast(t('events.unleashed', { name: t(`events.${e.id}`) }));
              }}
              title={t(`eventHint.${e.id}`)}
              disabled={isActive}
            >
              {e.icon}
              <span className="hidden xl:inline"> {t(`events.${e.id}`)}</span>
            </button>
          );
        })}
        <label
          className="btn flex items-center gap-1 cursor-pointer"
          title={t('events.random')}
          style={{ pointerEvents: 'auto' }}
        >
          <input
            type="checkbox"
            defaultChecked={sim.randomEvents}
            onChange={(ev) => {
              sim.randomEvents = ev.target.checked;
            }}
          />
          🎲
        </label>
      </div>

      {active.map((a) => (
        <div key={a.type} className="glass px-3 py-2 w-56 md:w-64 animate-slide-up">
          <div className="text-xs text-amber-200 mb-1">{t(`eventLabel.${a.labelKey}`, a.params)}</div>
          <div className="h-1 rounded bg-white/10 overflow-hidden">
            <div
              className="h-full bg-amber-400/80 transition-all duration-500"
              style={{ width: `${(a.progress * 100).toFixed(0)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
