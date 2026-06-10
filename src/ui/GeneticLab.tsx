import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { GENE_PRESETS, decodeSize, decodeSpeed, decodeVision } from '@/engine/Genetics';
import { getSprite, pickArchetype } from '@/engine/Sprites';
import { useStore } from '@/state/store';
import { Genes } from '@/types';
import { TAU } from '@/utils/math';

const GENE_KEYS: (keyof Genes)[] = [
  'speed',
  'size',
  'vision',
  'hue',
  'diet',
  'efficiency',
  'reproThreshold',
  'mutationRate',
  'lifespan',
  'nocturnal',
];

/** Preset i18n keys, parallel to GENE_PRESETS order. */
const PRESET_KEYS = ['speedDemon', 'tank', 'balanced', 'nocturnalHunter'];

/** Draw a live phenotype preview of the genome onto a small canvas. */
function PhenotypePreview({ genes }: { genes: Genes }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { t: tr } = useTranslation();

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
      const color = `hsl(${Math.round(genes.hue * 360)},72%,62%)`;

      // Vision radius hint.
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, decodeVision(genes) * 0.45, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);

      // Glow scales with nocturnality.
      ctx.globalAlpha = 0.15 + night * 0.3;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, 36, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Animated archetype sprite, scaled by the size gene.
      const arch = pickArchetype(genes);
      const frame: 0 | 1 = Math.sin(t * 4) > 0 ? 1 : 0;
      const sprite = getSprite(arch, genes.hue, frame);
      const archName = tr(`archetype.${arch}`);
      const scale = (3.2 + decodeSize(genes) * 0.55) | 0;
      const sw = sprite.width * scale;
      const sh = sprite.height * scale;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sprite, cx - sw / 2, cy - sh / 2 + Math.sin(t * 4) * 2, sw, sh);

      // Family name.
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '600 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(archName, cx, h - 8);

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [genes, tr]);

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
  const { t } = useTranslation();
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
    t('lab.pxs', { n: decodeSpeed(genes).toFixed(0) }),
    t('lab.px', { n: decodeSize(genes).toFixed(1) }),
    t('lab.sight', { n: decodeVision(genes).toFixed(0) }),
  ];

  return (
    <div className="glass absolute right-3 top-1/2 -translate-y-1/2 w-[340px] max-h-[88vh] max-md:inset-x-2 max-md:top-12 max-md:bottom-16 max-md:w-auto max-md:max-h-none max-md:translate-y-0 p-4 animate-slide-up overflow-y-auto thin-scroll">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">🧪 {t('lab.title')}</h2>
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
        {GENE_PRESETS.map((p, i) => (
          <button
            key={p.name}
            className="btn text-[11px]"
            onClick={() => setGenes({ ...p.genes })}
            title={t(`preset.${PRESET_KEYS[i]}Desc`)}
          >
            {t(`preset.${PRESET_KEYS[i]}`)}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {GENE_KEYS.map((key) => (
          <div key={key}>
            <div className="flex justify-between text-[11px] mb-0.5">
              <span className="text-slate-300">{t(`gene.${key}`)}</span>
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
            {key !== 'hue' && (
              <div className="flex justify-between text-[9px] text-slate-500">
                <span>{t(`geneLow.${key}`)}</span>
                <span>{t(`geneHigh.${key}`)}</span>
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
          showToast(t('lab.releaseHint'));
        }}
      >
        🌍 {t('lab.release')}
      </button>
    </div>
  );
}
