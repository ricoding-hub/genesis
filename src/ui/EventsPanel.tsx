import { getEngine } from '@/engine/engine';
import { useStore } from '@/state/store';
import { EventType } from '@/types';

const EVENTS: { id: EventType; icon: string; label: string; hint: string }[] = [
  { id: 'meteor', icon: '☄️', label: 'Meteor', hint: 'Obliterates a random area' },
  { id: 'iceage', icon: '🧊', label: 'Ice Age', hint: 'Global cold snap — food gets scarce' },
  { id: 'wildfire', icon: '🔥', label: 'Wildfire', hint: 'Fire spreads through forests' },
  { id: 'plague', icon: '🦠', label: 'Plague', hint: 'A random gene value becomes lethal' },
];

export function EventsPanel() {
  const snapshot = useStore((s) => s.snapshot);
  const showToast = useStore((s) => s.showToast);
  const active = snapshot?.activeEvents ?? [];

  return (
    <div className="absolute right-2 md:right-3 top-12 md:top-3 flex flex-col gap-2 items-end">
      <div className="glass px-2 md:px-2.5 py-1.5 md:py-2 flex gap-1.5 animate-fade-in">
        {EVENTS.map((e) => {
          const isActive = active.some((a) => a.type === e.id);
          return (
            <button
              key={e.id}
              className={`btn btn-danger ${isActive ? 'btn-active animate-pulse-soft' : ''}`}
              onClick={() => {
                getEngine().sim.triggerEvent(e.id);
                showToast(`${e.icon} ${e.label} unleashed`);
              }}
              title={e.hint}
              disabled={isActive}
            >
              {e.icon}
              <span className="hidden md:inline"> {e.label}</span>
            </button>
          );
        })}
      </div>

      {active.map((a) => (
        <div key={a.type} className="glass px-3 py-2 w-56 md:w-64 animate-slide-up">
          <div className="text-xs text-amber-200 mb-1">{a.label}</div>
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
