import { useEffect, useRef } from 'react';
import { GENE_PRESETS, decodeSize, decodeSpeed, decodeVision } from '@/engine/Genetics';
import { useStore } from '@/state/store';
import { Genes } from '@/types';
import { hsl } from '@/utils/colors';
import { TAU } from '@/utils/math';

const GENE_LABELS: { key: keyof Genes; label: string; low: string; high: string }[] = [
  { key: 'speed', label: 'Speed', low: 'slow', high: 'fast' },
  { key: 'size', label: 'Size', low: 'tiny', high: 'huge' },
  { key: 'vision', label: 'Vision', low: 'blind', high: 'eagle' },
  { key: 'hue', label: 'Color', low: '', high: '' },
  { key: 'diet', label: 'Diet', low: 'herbivore', high: 'carnivore' },
  { key: 'efficiency', label: 'Efficiency', low: 'wasteful', high: 'frugal' },
  { key: 'reproThreshold', label: 'Repro. threshold', low: 'eager', high: 'cautious' },
  { key: 'mutationRate', label: 'Mutation rate', low: 'stable', high: 'chaotic' },
  { key: 'lifespan', label: 'Lifespan', low: 'brief', high: 'ancient' },
  { key: 'nocturnal', label: 'Nocturnality', low: 'diurnal', high: 'nocturnal' },
];

/** Draw a live phenotype preview of the genome onto a small canvas. */
function PhenotypePreview({ genes }: { genes: Genes }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let t = 0;

    const draw = () => {
      t += 0.016;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Background hints at preferred time of day.
      const night = genes.nocturnal;
      ctx.fillStyle = `rgb(${18 - night * 10},${26 - night * 14},${44 - night * 10})`;
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const r = (8 + decodeSize(genes) * 3.4) * (1 + Math.sin(t * 3.2) * 0.05);
      const color = hsl(genes.hue * 360, 0.72, 0.62);

      // Vision radius hint.
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, decodeVision(genes) * 0.45, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);

      // Glow scales with nocturnality.
      ctx.globalAlpha = 0.18 + night * 0.3;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 2.2, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Body with speed-stretch.
      const stretch = 1 + genes.speed * 0.35;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(t * 0.8) * 0.3);
      ctx.scale(stretch, 1 / stretch);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath();
      ctx.arc(-r * 0.15, -r * 0.25, r * 0.55, 0, TAU);
      ctx.fill();
      // Eye — red-ish for carnivores.
      ctx.fillStyle = genes.diet > 0.6 ? '#b22' : 'rgba(10,14,22,0.85)';
      ctx.beginPath();
      ctx.arc(r * 0.55, 0, Math.max(1.4, r * 0.2), 0, TAU);
      ctx.fill();
      ctx.restore();

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [genes]);

  return (
    <canvas
      ref={ref}
      width={190}
      height={150}
      className="rounded-lg border border-white/10 w-full"
    />
  );
}

export function GeneticLab() {
  const open = useStore((s) => s.labOpen);
  const setOpen = useStore((s) => s.setLabOpen);
  const genes = useStore((s) => s.labGenes);
  const setGenes = useStore((s) => s.setLabGenes);
  const setSpawnGenes = useStore((s) => s.setSpawnGenes);
  const setTool = useStore((s) => s.setTool);
  const toggleGodMode = useStore((s) => s.toggleGodMode);
  const godModeOpen = useStore((s) => s.godModeOpen);
  const showToast = useStore((s) => s.showToast);

  if (!open) return null;

  const stats = [
    `${decodeSpeed(genes).toFixed(0)} px/s`,
    `${decodeSize(genes).toFixed(1)} px`,
    `${decodeVision(genes).toFixed(0)} px sight`,
  ];

  return (
    <div className="glass absolute right-3 top-1/2 -translate-y-1/2 w-[340px] p-4 animate-slide-up max-h-[88vh] overflow-y-auto thin-scroll">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">🧪 Genetic Lab</h2>
        <button className="btn" onClick={() => setOpen(false)}>
          ✕
        </button>
      </div>

      <PhenotypePreview genes={genes} />
      <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1 mb-3">
        {stats.map((s) => (
          <span key={s}>{s}</span>
        ))}
      </div>

      <div className="flex gap-1.5 flex-wrap mb-3">
        {GENE_PRESETS.map((p) => (
          <button
            key={p.name}
            className="btn text-[11px]"
            onClick={() => setGenes({ ...p.genes })}
            title={p.description}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {GENE_LABELS.map(({ key, label, low, high }) => (
          <div key={key}>
            <div className="flex justify-between text-[11px] mb-0.5">
              <span className="text-slate-300">{label}</span>
              <span className="text-slate-500 font-mono">{genes[key].toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={genes[key]}
              onChange={(e) => setGenes({ ...genes, [key]: Number(e.target.value) })}
              className="w-full"
              style={
                key === 'hue'
                  ? {
                      background:
                        'linear-gradient(to right, hsl(0,70%,55%), hsl(60,70%,55%), hsl(120,70%,55%), hsl(180,70%,55%), hsl(240,70%,55%), hsl(300,70%,55%), hsl(360,70%,55%))',
                    }
                  : undefined
              }
            />
            {low && (
              <div className="flex justify-between text-[9px] text-slate-500">
                <span>{low}</span>
                <span>{high}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        className="btn btn-active w-full mt-4 py-2.5 text-sm"
        onClick={() => {
          setSpawnGenes({ ...genes });
          setTool('spawn');
          if (!godModeOpen) toggleGodMode();
          setOpen(false);
          showToast('Click anywhere on land to release your creature');
        }}
      >
        🌍 Release into world
      </button>
    </div>
  );
}
