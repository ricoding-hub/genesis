import { Biome, BIOME_NAMES, GodTool } from '@/types';
import { useStore } from '@/state/store';
import { useIsMobile } from './useIsMobile';

const PAINTABLE: Biome[] = [
  Biome.Grassland,
  Biome.Forest,
  Biome.Desert,
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
};

const TOOLS: { id: GodTool; icon: string; label: string; hint: string }[] = [
  { id: 'terraform', icon: '🏔', label: 'Terraform', hint: 'Drag to paint biomes' },
  { id: 'food', icon: '🌾', label: 'Spawn food', hint: 'Click to drop a food cluster' },
  { id: 'kill', icon: '💀', label: 'Kill zone', hint: 'Drag to kill everything inside' },
  { id: 'spawn', icon: '🧬', label: 'Spawn creature', hint: 'Click to place a creature' },
  { id: 'tribe', icon: '🛖', label: 'Found tribe', hint: 'Click to settle a humanoid tribe' },
];

export function GodMode() {
  const open = useStore((s) => s.godModeOpen);
  const toggle = useStore((s) => s.toggleGodMode);
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const brushBiome = useStore((s) => s.brushBiome);
  const setBrushBiome = useStore((s) => s.setBrushBiome);
  const brushRadius = useStore((s) => s.brushRadius);
  const setBrushRadius = useStore((s) => s.setBrushRadius);
  const setLabOpen = useStore((s) => s.setLabOpen);
  const setSpawnGenes = useStore((s) => s.setSpawnGenes);
  const isMobile = useIsMobile();

  return (
    <div
      className={
        isMobile
          ? 'absolute left-2 bottom-[84px] flex flex-col-reverse gap-2 items-start'
          : 'absolute left-3 top-1/2 -translate-y-1/2 flex flex-col gap-2'
      }
    >
      <button
        className={`glass px-3 py-2 text-sm font-semibold transition-colors ${
          open ? 'text-amber-300' : 'text-slate-300 hover:text-white'
        }`}
        onClick={toggle}
        title="Toggle God Mode (G)"
        style={{ pointerEvents: 'auto' }}
      >
        ⚡{!isMobile && ' God Mode'}
      </button>

      {open && (
        <div className="glass p-2.5 flex flex-col gap-1.5 w-48 animate-slide-up max-h-[55vh] overflow-y-auto thin-scroll">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={`btn text-left flex items-center gap-2 ${tool === t.id ? 'btn-active' : ''}`}
              onClick={() => setTool(tool === t.id ? 'none' : t.id)}
              title={t.hint}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}

          {tool === 'terraform' && (
            <div className="mt-1 border-t border-white/10 pt-2">
              <div className="panel-title mb-1.5">Paint biome</div>
              <div className="grid grid-cols-4 gap-1.5">
                {PAINTABLE.map((b) => (
                  <button
                    key={b}
                    className={`h-7 rounded-md border transition-transform ${
                      brushBiome === b
                        ? 'border-white scale-110'
                        : 'border-white/15 hover:scale-105'
                    }`}
                    style={{ background: BIOME_SWATCH[b], pointerEvents: 'auto' }}
                    onClick={() => setBrushBiome(b)}
                    title={BIOME_NAMES[b]}
                  />
                ))}
              </div>
            </div>
          )}

          {(tool === 'terraform' || tool === 'kill') && (
            <div className="mt-1">
              <div className="panel-title mb-1">Brush size</div>
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
            <div className="mt-1 border-t border-white/10 pt-2 flex flex-col gap-1.5">
              <button
                className="btn"
                onClick={() => setSpawnGenes(null)}
                title="Each click spawns a creature with random DNA"
              >
                🎲 Random DNA
              </button>
              <button
                className="btn"
                onClick={() => setLabOpen(true)}
                title="Design a genome in the Genetic Lab (L)"
              >
                🧪 Open Genetic Lab
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
