import { ReactNode } from 'react';
import { useStore } from '@/state/store';

/**
 * Shared docked panel shell. One panel shows at a time on the right (desktop)
 * or as a full-screen sheet (mobile), so panels never overlap. Always has a
 * clear title and a big close button.
 */
export function Panel({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: ReactNode;
}) {
  const setPanel = useStore((s) => s.setPanel);
  return (
    <div
      className="glass absolute z-20 flex flex-col animate-slide-up
        right-3 top-16 bottom-[72px] w-[360px]
        max-md:inset-x-0 max-md:top-0 max-md:bottom-0 max-md:w-auto max-md:rounded-none"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 shrink-0">
        <span className="text-base">{icon}</span>
        <h2 className="text-sm font-semibold flex-1 truncate">{title}</h2>
        <button
          className="btn !px-2.5 !py-1.5 text-sm"
          onClick={() => setPanel('none')}
          aria-label="close"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto thin-scroll p-4">{children}</div>
    </div>
  );
}
