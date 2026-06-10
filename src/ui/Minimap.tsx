import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getEngine } from '@/engine/engine';
import { useStore } from '@/state/store';
import { Biome } from '@/types';
import { BIOME_COLORS } from '@/utils/colors';
import { WORLD_H, WORLD_W } from '@/engine/World';

const MAP_W = 220;
const MAP_H = 150;

export function Minimap() {
  const { t: tt } = useTranslation();
  const visible = useStore((s) => s.minimapVisible);
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!visible) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const { sim, camera } = getEngine();
    let raf = 0;
    let lastBake = -1;
    const terrain = document.createElement('canvas');
    terrain.width = MAP_W;
    terrain.height = MAP_H;
    const tctx = terrain.getContext('2d')!;

    const bakeTerrain = () => {
      const world = sim.world;
      const img = tctx.createImageData(MAP_W, MAP_H);
      for (let y = 0; y < MAP_H; y++) {
        for (let x = 0; x < MAP_W; x++) {
          const c = Math.floor((x / MAP_W) * world.cols);
          const r = Math.floor((y / MAP_H) * world.rows);
          const biome = world.biomes[r * world.cols + c] as Biome;
          const col = BIOME_COLORS[biome].base;
          const i = (y * MAP_W + x) * 4;
          img.data[i] = col[0];
          img.data[i + 1] = col[1];
          img.data[i + 2] = col[2];
          img.data[i + 3] = 255;
        }
      }
      tctx.putImageData(img, 0, 0);
    };

    const draw = () => {
      if (sim.world.terrainVersion !== lastBake) {
        lastBake = sim.world.terrainVersion;
        bakeTerrain();
      }
      ctx.clearRect(0, 0, MAP_W, MAP_H);
      ctx.drawImage(terrain, 0, 0);

      // Creature density heatmap dots colored by species.
      const sx = MAP_W / WORLD_W;
      const sy = MAP_H / WORLD_H;
      for (const c of sim.creatures) {
        ctx.fillStyle = sim.species.speciesColor(c.speciesId);
        ctx.globalAlpha = 0.85;
        ctx.fillRect(c.x * sx - 0.8, c.y * sy - 0.8, 1.8, 1.8);
      }
      ctx.globalAlpha = 1;

      // Viewport rectangle.
      const rect = camera.visibleRect();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1;
      ctx.strokeRect(rect.x * sx, rect.y * sy, rect.w * sx, rect.h * sy);

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="glass absolute bottom-4 left-3 max-md:bottom-[64px] max-md:left-2 p-1.5 animate-fade-in z-10">
      <canvas
        ref={ref}
        width={MAP_W}
        height={MAP_H}
        className="rounded-lg cursor-pointer block max-md:w-[132px] max-md:h-auto"
        style={{ pointerEvents: 'auto' }}
        title={tt('minimap.jump')}
        onPointerDown={(e) => {
          const { camera } = getEngine();
          const rect = e.currentTarget.getBoundingClientRect();
          const wx = ((e.clientX - rect.left) / rect.width) * WORLD_W;
          const wy = ((e.clientY - rect.top) / rect.height) * WORLD_H;
          camera.centerOn(wx, wy);
        }}
      />
    </div>
  );
}
