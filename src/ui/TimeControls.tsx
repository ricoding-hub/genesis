import { useTranslation } from 'react-i18next';
import { getEngine } from '@/engine/engine';
import type { SimSpeed } from '@/engine/Simulation';
import { useStore } from '@/state/store';

const SPEEDS: SimSpeed[] = [1, 2, 5, 10];

export function TimeControls() {
  const snapshot = useStore((s) => s.snapshot);
  const { t } = useTranslation();
  if (!snapshot) return null;
  const { sim } = getEngine();

  return (
    <div className="time-bar glass absolute bottom-4 max-md:bottom-[60px] left-1/2 -translate-x-1/2 px-3 max-md:px-2 py-2 max-md:py-1.5 flex items-center gap-1.5 max-md:gap-1 animate-fade-in z-20">
      <button
        className="btn text-base px-3"
        onClick={() => {
          sim.paused = !sim.paused;
        }}
        title={t('controls.pausePlay')}
      >
        {snapshot.paused ? '▶' : '⏸'}
      </button>
      <button
        className="btn"
        onClick={() => {
          sim.paused = true;
          sim.stepOnce();
        }}
        title={t('controls.stepTitle')}
      >
        ⏭<span className="hidden md:inline"> {t('controls.step')}</span>
      </button>
      <div className="w-px h-5 bg-white/10 mx-1" />
      {SPEEDS.map((sp) => (
        <button
          key={sp}
          className={`btn font-mono ${snapshot.speed === sp && !snapshot.paused ? 'btn-active' : ''}`}
          onClick={() => {
            sim.speed = sp;
            sim.paused = false;
          }}
          title={t('controls.speed', { n: sp })}
        >
          {sp}x
        </button>
      ))}
    </div>
  );
}
