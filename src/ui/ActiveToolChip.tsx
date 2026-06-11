import { useTranslation } from 'react-i18next';
import { useStore } from '@/state/store';

/** Icon for each god tool (kept in sync with GodMode). */
const TOOL_ICON: Record<string, string> = {
  terraform: '🏔',
  food: '🌾',
  wall: '🧱',
  gate: '🚪',
  spawn: '🧬',
  tribe: '🛖',
  humans: '👥',
  bless: '🌟',
  bible: '📖',
  smite: '⚡',
  kill: '💀',
};

/**
 * Floating pill shown whenever a god tool is armed. It does NOT cover the map,
 * so the tool is actually usable on mobile (the panel steps aside). Shows what
 * the next map click does, plus quick reopen / cancel — and, for the bible
 * tool, an inline name field.
 */
export function ActiveToolChip() {
  const { t } = useTranslation();
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const setPanel = useStore((s) => s.setPanel);
  const bibleName = useStore((s) => s.bibleName);
  const setBibleName = useStore((s) => s.setBibleName);
  if (tool === 'none') return null;

  return (
    <div className="glass absolute top-16 max-md:top-[58px] left-1/2 -translate-x-1/2 px-3 py-2 flex items-center gap-2 max-w-[94vw] animate-slide-up z-20">
      <span className="text-base shrink-0">{TOOL_ICON[tool] ?? '✨'}</span>
      <div className="min-w-0">
        <div className="text-xs font-semibold leading-tight">{t(`god.${tool}`)}</div>
        <div className="text-[10px] text-slate-400 leading-tight truncate">
          {t(`god.${tool}Hint`)}
        </div>
      </div>

      {tool === 'bible' && (
        <input
          type="text"
          value={bibleName}
          onChange={(e) => setBibleName(e.target.value)}
          placeholder={t('god.bibleName')}
          maxLength={18}
          className="ml-1 w-24 bg-white/10 border border-white/15 rounded-md px-2 py-1 text-xs outline-none focus:border-emerald-400/60"
          style={{ pointerEvents: 'auto', WebkitUserSelect: 'text', userSelect: 'text' }}
        />
      )}

      <div className="flex items-center gap-1 ml-1 shrink-0">
        <button
          className="btn !px-2 !py-1"
          onClick={() => setPanel('god')}
          title={t('chip.options')}
        >
          ⚙
        </button>
        <button
          className="btn !px-2 !py-1"
          onClick={() => setTool('none')}
          title={t('chip.cancel')}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
