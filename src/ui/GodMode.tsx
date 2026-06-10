import { useTranslation } from 'react-i18next';
import { Biome, BIOME_KEYS, CohortProfile, CohortSex, GodTool } from '@/types';
import { useStore } from '@/state/store';

const PAINTABLE: Biome[] = [
  Biome.Grassland,
  Biome.Forest,
  Biome.Jungle,
  Biome.Savanna,
  Biome.Desert,
  Biome.Swamp,
  Biome.Tundra,
  Biome.Mountain,
  Biome.Shore,
  Biome.Ocean,
];

const BIOME_SWATCH: Record<number, string> = {
  [Biome.Ocean]: '#1a4a8c',
  [Biome.Shore]: '#d4c08c',
  [Biome.Grassland]: '#588e46',
  [Biome.Forest]: '#2a5e38',
  [Biome.Desert]: '#d6b26e',
  [Biome.Tundra]: '#cedae2',
  [Biome.Mountain]: '#76706e',
  [Biome.Wasteland]: '#483a34',
  [Biome.Jungle]: '#1e582c',
  [Biome.Swamp]: '#40543e',
  [Biome.River]: '#2860a0',
  [Biome.Savanna]: '#a89e58',
};

/** Tools grouped so the user can scan by intent. danger = red styling. */
const GROUPS: { titleIcon: string; tools: { id: GodTool; icon: string; key: string; danger?: boolean }[] }[] = [
  {
    titleIcon: '🌍',
    tools: [
      { id: 'terraform', icon: '🏔', key: 'terraform' },
      { id: 'food', icon: '🌾', key: 'food' },
      { id: 'wall', icon: '🧱', key: 'wall' },
      { id: 'gate', icon: '🚪', key: 'gate' },
    ],
  },
  {
    titleIcon: '🧬',
    tools: [
      { id: 'spawn', icon: '🧬', key: 'spawn' },
      { id: 'tribe', icon: '🛖', key: 'tribe' },
      { id: 'humans', icon: '👥', key: 'humans' },
    ],
  },
  {
    titleIcon: '⚡',
    tools: [
      { id: 'bless', icon: '🌟', key: 'bless' },
      { id: 'smite', icon: '⚡', key: 'smite', danger: true },
      { id: 'kill', icon: '💀', key: 'kill', danger: true },
    ],
  },
];

const COHORT_SEXES: CohortSex[] = ['mixed', 'M', 'F'];
const COHORT_PROFILES: CohortProfile[] = ['balanced', 'smart', 'strong', 'nocturnal'];
const SEX_LABEL: Record<CohortSex, string> = { mixed: 'sexMixed', M: 'sexMale', F: 'sexFemale' };
const PROFILE_LABEL: Record<CohortProfile, string> = {
  balanced: 'profileBalanced',
  smart: 'profileSmart',
  strong: 'profileStrong',
  nocturnal: 'profileNocturnal',
};

export function GodSection() {
  const { t } = useTranslation();
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const brushBiome = useStore((s) => s.brushBiome);
  const setBrushBiome = useStore((s) => s.setBrushBiome);
  const brushRadius = useStore((s) => s.brushRadius);
  const setBrushRadius = useStore((s) => s.setBrushRadius);
  const setLabOpen = useStore((s) => s.setLabOpen);
  const setSpawnGenes = useStore((s) => s.setSpawnGenes);
  const cohortSex = useStore((s) => s.cohortSex);
  const setCohortSex = useStore((s) => s.setCohortSex);
  const cohortCount = useStore((s) => s.cohortCount);
  const setCohortCount = useStore((s) => s.setCohortCount);
  const cohortProfile = useStore((s) => s.cohortProfile);
  const setCohortProfile = useStore((s) => s.setCohortProfile);

  return (
    <div className="flex flex-col gap-3">
      {/* Active tool hint so it's obvious what a map click will do. */}
      {tool !== 'none' && (
        <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-100">
          {t(`god.${tool}Hint`)}
        </div>
      )}

      {GROUPS.map((g, gi) => (
        <div key={gi} className="flex flex-col gap-1.5">
          {g.tools.map((tl) => (
            <button
              key={tl.id}
              className={`btn text-left flex items-center gap-2.5 py-2 ${
                tool === tl.id ? 'btn-active' : tl.danger ? 'btn-danger' : ''
              }`}
              onClick={() => setTool(tool === tl.id ? 'none' : tl.id)}
            >
              <span className="text-base shrink-0">{tl.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-medium">{t(`god.${tl.key}`)}</span>
                <span className="block text-[10px] text-slate-400 leading-tight">
                  {t(`god.${tl.key}Hint`)}
                </span>
              </span>
            </button>
          ))}
        </div>
      ))}

      {/* Contextual options for the active tool. */}
      {tool === 'terraform' && (
        <div className="border-t border-white/10 pt-3">
          <div className="panel-title mb-1.5">{t('god.paintBiome')}</div>
          <div className="grid grid-cols-5 gap-1.5">
            {PAINTABLE.map((b) => (
              <button
                key={b}
                className={`h-8 rounded-md border transition-transform ${
                  brushBiome === b ? 'border-white scale-110' : 'border-white/15 hover:scale-105'
                }`}
                style={{ background: BIOME_SWATCH[b], pointerEvents: 'auto' }}
                onClick={() => setBrushBiome(b)}
                title={t(`biome.${BIOME_KEYS[b]}`)}
              />
            ))}
          </div>
        </div>
      )}

      {(tool === 'terraform' || tool === 'kill' || tool === 'wall' || tool === 'gate') && (
        <div>
          <div className="panel-title mb-1">{t('god.brushSize')}</div>
          <input
            type="range"
            min={25}
            max={220}
            value={brushRadius}
            onChange={(e) => setBrushRadius(Number(e.target.value))}
            className="w-full"
            style={{ pointerEvents: 'auto' }}
          />
        </div>
      )}

      {tool === 'spawn' && (
        <div className="border-t border-white/10 pt-3 flex flex-col gap-1.5">
          <button className="btn" onClick={() => setSpawnGenes(null)} title={t('god.randomDNAHint')}>
            🎲 {t('god.randomDNA')}
          </button>
          <button className="btn" onClick={() => setLabOpen(true)} title={t('god.openLabHint')}>
            🧪 {t('god.openLab')}
          </button>
        </div>
      )}

      {tool === 'humans' && (
        <div className="border-t border-white/10 pt-3 flex flex-col gap-2.5">
          <div>
            <div className="panel-title mb-1">{t('god.cohortSex')}</div>
            <div className="grid grid-cols-3 gap-1">
              {COHORT_SEXES.map((s) => (
                <button
                  key={s}
                  className={`btn !px-1 text-[11px] ${cohortSex === s ? 'btn-active' : ''}`}
                  onClick={() => setCohortSex(s)}
                >
                  {t(`god.${SEX_LABEL[s]}`)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="panel-title mb-1">{t('god.cohortProfile')}</div>
            <div className="grid grid-cols-2 gap-1">
              {COHORT_PROFILES.map((p) => (
                <button
                  key={p}
                  className={`btn !px-1 text-[11px] ${cohortProfile === p ? 'btn-active' : ''}`}
                  onClick={() => setCohortProfile(p)}
                >
                  {t(`god.${PROFILE_LABEL[p]}`)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="panel-title mb-1">
              {t('god.cohortCount')}: {cohortCount}
            </div>
            <input
              type="range"
              min={2}
              max={30}
              value={cohortCount}
              onChange={(e) => setCohortCount(Number(e.target.value))}
              className="w-full"
              style={{ pointerEvents: 'auto' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
