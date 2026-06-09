import { Biome } from '@/types';
import { rand, TAU } from '@/utils/math';
import type { Camera } from './Camera';
import type { World } from './World';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: 'ambient' | 'ember' | 'burst';
  drift: number;
}

const MAX_PARTICLES = 420;

/**
 * Pooled particle system. Ambient particles spawn inside the visible rect
 * with biome-appropriate looks (pollen, sand, snow…); events push embers
 * and bursts.
 */
export class ParticleSystem {
  private pool: Particle[] = [];

  private spawn(p: Particle): void {
    if (this.pool.length >= MAX_PARTICLES) return;
    this.pool.push(p);
  }

  /** Emit an explosion burst (meteor impact, creature death pop). */
  burst(x: number, y: number, count: number, color: string, speed = 90): void {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const s = rand(speed * 0.3, speed);
      this.spawn({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0,
        maxLife: rand(0.5, 1.3),
        size: rand(1.5, 4),
        color,
        kind: 'burst',
        drift: 0,
      });
    }
  }

  ember(x: number, y: number): void {
    this.spawn({
      x: x + rand(-8, 8),
      y: y + rand(-8, 8),
      vx: rand(-6, 6),
      vy: rand(-34, -16),
      life: 0,
      maxLife: rand(0.8, 1.8),
      size: rand(1.2, 2.8),
      color: '#ffb04a',
      kind: 'ember',
      drift: rand(0, TAU),
    });
  }

  /** Maintain ambient density inside the camera view. */
  updateAmbient(world: World, camera: Camera, dt: number, isNight: boolean): void {
    const rect = camera.visibleRect();
    // Target ambient count scales inversely with zoom-out (avoid dust storms).
    const target = Math.min(150, 40 + camera.dzoom * 90);
    let ambient = 0;
    for (const p of this.pool) if (p.kind === 'ambient') ambient++;

    const toSpawn = Math.min(4, target - ambient);
    for (let i = 0; i < toSpawn; i++) {
      const x = rect.x + Math.random() * rect.w;
      const y = rect.y + Math.random() * rect.h;
      const biome = world.biomeAt(x, y);
      const def = this.ambientFor(biome, isNight);
      if (!def) continue;
      this.spawn({
        x,
        y,
        vx: def.vx,
        vy: def.vy,
        life: 0,
        maxLife: rand(2.5, 6),
        size: def.size,
        color: def.color,
        kind: 'ambient',
        drift: rand(0, TAU),
      });
    }

    this.step(dt);
  }

  private ambientFor(
    biome: Biome,
    isNight: boolean,
  ): { color: string; size: number; vx: number; vy: number } | null {
    switch (biome) {
      case Biome.Grassland:
        return isNight
          ? { color: 'rgba(190,255,170,0.85)', size: rand(1, 2), vx: rand(-4, 4), vy: rand(-3, 1) } // fireflies
          : { color: 'rgba(255,250,200,0.55)', size: rand(0.8, 1.8), vx: rand(2, 9), vy: rand(-2, 2) }; // pollen
      case Biome.Forest:
        return isNight
          ? { color: 'rgba(150,255,190,0.8)', size: rand(1, 2.2), vx: rand(-3, 3), vy: rand(-2, 1) }
          : { color: 'rgba(210,255,190,0.4)', size: rand(0.8, 1.6), vx: rand(1, 6), vy: rand(-1, 3) };
      case Biome.Desert:
        return { color: 'rgba(255,225,160,0.45)', size: rand(0.7, 1.6), vx: rand(14, 30), vy: rand(-3, 3) }; // blowing sand
      case Biome.Tundra:
        return { color: 'rgba(240,248,255,0.8)', size: rand(1, 2.4), vx: rand(-6, 10), vy: rand(8, 22) }; // snow
      case Biome.Mountain:
        return { color: 'rgba(230,235,245,0.5)', size: rand(0.8, 1.6), vx: rand(-12, 12), vy: rand(2, 10) };
      case Biome.Wasteland:
        return { color: 'rgba(120,110,100,0.5)', size: rand(1, 2.4), vx: rand(-5, 5), vy: rand(-10, -3) }; // ash
      case Biome.Ocean:
      case Biome.Shore:
        return null; // water shimmer handles these
      default:
        return null;
    }
  }

  private step(dt: number): void {
    let w = 0;
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i];
      p.life += dt;
      if (p.life >= p.maxLife) continue;
      p.drift += dt * 2;
      p.x += (p.vx + Math.sin(p.drift) * 6) * dt;
      p.y += p.vy * dt;
      if (p.kind === 'burst') {
        p.vx *= 1 - 2.4 * dt;
        p.vy *= 1 - 2.4 * dt;
      }
      this.pool[w++] = p;
    }
    this.pool.length = w;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.pool) {
      const t = p.life / p.maxLife;
      const alpha = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
      ctx.globalAlpha = Math.max(0, alpha) * 0.9;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
