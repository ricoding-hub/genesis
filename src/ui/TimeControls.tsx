import { getEngine } from '@/engine/engine';
import type { SimSpeed } from '@/engine/Simulation';
import { useStore } from '@/state/store';

const SPEEDS: SimSpeed[] = [1, 2, 5, 10];

export function TimeControls() {
  const snapshot = useStore((s) => s.snapshot);
  if (!snapshot) return null;
  const { sim } = getEngine();

  return (
    <div className="glass absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-2 flex items-center gap-1.5 animate-fade-in">
      <button
        className="btn text-base px-3"
        onClick={() => {
          sim.paused = !sim.paused;
        }}
        title="Pause / play (Space)"
      >
        {snapshot.paused ? '▶' : '⏸'}
      </button>
      <button
        className="btn"
        onClick={() => {
          sim.paused = true;
          sim.stepOnce();
        }}
        title="Step one tick (.)"
      >
        ⏭ step
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
          title={`Run at ${sp}x speed`}
        >
          {sp}x
        </button>
      ))}
    </div>
  );
}
