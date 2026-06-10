import { useTranslation } from 'react-i18next';
import { getEngine } from '@/engine/engine';
import { useStore } from '@/state/store';
import { EventType } from '@/types';

/** danger = destructive (asks confirmation); else a boon (fires directly). */
const EVENTS: { id: EventType; icon: string; danger: boolean }[] = [
  { id: 'meteor', icon: '☄️', danger: true },
  { id: 'volcano', icon: '🌋', danger: true },
  { id: 'earthquake', icon: '🫨', danger: true },
  { id: 'wildfire', icon: '🔥', danger: true },
  { id: 'flood', icon: '🌊', danger: true },
  { id: 'drought', icon: '🌵', danger: true },
  { id: 'iceage', icon: '🧊', danger: true },
  { id: 'plague', icon: '🦠', danger: true },
  { id: 'locust', icon: '🦗', danger: true },
  { id: 'eclipse', icon: '🌑', danger: false },
  { id: 'bloom', icon: '🌸', danger: false },
];

/** The events catalog, shown inside the docked panel. */
export function EventsSection() {
  const { t } = useTranslation();
  const snapshot = useStore((s) => s.snapshot);
  const showToast = useStore((s) => s.showToast);
  const askConfirm = useStore((s) => s.askConfirm);
  const active = snapshot?.activeEvents ?? [];
  const { sim } = getEngine();

  const fire = (id: EventType) => {
    sim.triggerEvent(id);
    showToast(t('events.unleashed', { name: t(`events.${id}`) }));
  };

  return (
    <div className="flex flex-col gap-3">
      <label
        className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 cursor-pointer"
        style={{ pointerEvents: 'auto' }}
      >
        <span className="text-xs text-slate-300">🎲 {t('events.random')}</span>
        <input
          type="checkbox"
          defaultChecked={sim.randomEvents}
          onChange={(e) => {
            sim.randomEvents = e.target.checked;
          }}
          className="w-4 h-4"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        {EVENTS.map((e) => {
          const isActive = active.some((a) => a.type === e.id);
          return (
            <button
              key={e.id}
              className={`btn text-left flex items-center gap-2.5 py-2 ${
                isActive ? 'btn-active animate-pulse-soft' : e.danger ? 'btn-danger' : ''
              }`}
              disabled={isActive}
              onClick={() => {
                if (e.danger) {
                  askConfirm({
                    titleKey: 'confirm.eventTitle',
                    bodyKey: 'confirm.eventBody',
                    confirmKey: 'confirm.eventYes',
                    params: { name: t(`events.${e.id}`) },
                    danger: true,
                    onConfirm: () => fire(e.id),
                  });
                } else {
                  fire(e.id);
                }
              }}
            >
              <span className="text-base shrink-0">{e.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-medium">{t(`events.${e.id}`)}</span>
                <span className="block text-[10px] text-slate-400 leading-tight">
                  {t(`eventHint.${e.id}`)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Small always-visible indicator of events currently unfolding. */
export function ActiveEvents() {
  const { t } = useTranslation();
  const snapshot = useStore((s) => s.snapshot);
  const active = snapshot?.activeEvents ?? [];
  if (active.length === 0) return null;
  return (
    <div className="absolute top-16 max-md:top-[104px] left-1/2 -translate-x-1/2 flex flex-col gap-1.5 w-60 max-md:w-52 pointer-events-none z-10">
      {active.map((a) => (
        <div key={a.type} className="glass px-3 py-1.5 animate-slide-up">
          <div className="text-[11px] text-amber-200 mb-1 truncate">
            {t(`eventLabel.${a.labelKey}`, a.params)}
          </div>
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
