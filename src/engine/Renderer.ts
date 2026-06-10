import { Biome, GodTool } from '@/types';
import { BIOME_COLORS, mixRgb, nightOverlay, rgbToCss } from '@/utils/colors';
import { clamp01, TAU } from '@/utils/math';
import { mulberry32 } from '@/utils/noise';
import { ArchetypeId, getSprite, humanoidSprite } from './Sprites';
import type { Camera } from './Camera';
import type { Creature } from './Creature';
import { ParticleSystem } from './Particles';
import type { Simulation } from './Simulation';
import { TILE_SIZE, WORLD_H, WORLD_W } from './World';

/** Cursor brush state shown for god tools. */
export interface BrushState {
  tool: GodTool;
  x: number;
  y: number;
  radius: number;
  visible: boolean;
}

/**
 * Canvas renderer: pre-baked terrain layer + dynamic entity layer.
 * All world drawing happens under a camera transform; UI lives in React.
 */
export class Renderer {
  particles = new ParticleSystem();
  brush: BrushState = { tool: 'none', x: 0, y: 0, radius: 60, visible: false };
  selected: Creature | null = null;
  /** 1 = full effects (desktop), 0.5 = reduced (mobile/touch). */
  quality = 1;

  private terrainCtx: CanvasRenderingContext2D;
  private entityCtx: CanvasRenderingContext2D;
  private baked: HTMLCanvasElement;
  private bakedCtx: CanvasRenderingContext2D;
  private waterMask: HTMLCanvasElement;
  private causticPattern: HTMLCanvasElement;
  private waterFx: HTMLCanvasElement;
  private waterFxCtx: CanvasRenderingContext2D;
  private bakedVersion = -1;
  private dpr = 1;
  private time = 0;

  constructor(
    private terrainCanvas: HTMLCanvasElement,
    private entityCanvas: HTMLCanvasElement,
    private sim: Simulation,
    private camera: Camera,
  ) {
    this.terrainCtx = terrainCanvas.getContext('2d')!;
    this.entityCtx = entityCanvas.getContext('2d')!;
    this.baked = document.createElement('canvas');
    this.baked.width = WORLD_W;
    this.baked.height = WORLD_H;
    this.bakedCtx = this.baked.getContext('2d')!;
    this.waterMask = document.createElement('canvas');
    this.waterMask.width = WORLD_W;
    this.waterMask.height = WORLD_H;
    this.causticPattern = this.makeCausticPattern();
    this.waterFx = document.createElement('canvas');
    this.waterFxCtx = this.waterFx.getContext('2d')!;
  }

  resize(w: number, h: number, dpr: number): void {
    this.dpr = dpr;
    for (const c of [this.terrainCanvas, this.entityCanvas]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
    }
    // Water FX runs at half resolution — the soft look reads as blur and
    // the composite fill-rate cost drops 4x.
    this.waterFx.width = Math.max(1, Math.round((w * dpr) / 2));
    this.waterFx.height = Math.max(1, Math.round((h * dpr) / 2));
    this.camera.setViewport(w, h);
    this.particles.quality = this.quality;
  }

  /** Render one frame. `dt` is real seconds since last frame. */
  frame(dt: number): void {
    this.time += dt;
    this.camera.update(dt);
    this.bakeIfNeeded();

    this.drawTerrainLayer();
    this.drawEntityLayer(dt);
  }

  // ---------------- terrain baking ----------------

  private bakeIfNeeded(): void {
    const world = this.sim.world;
    if (world.terrainVersion === this.bakedVersion) return;

    const full = this.bakedVersion < 0 || world.dirtyTiles.length > 4000;
    const tiles = full
      ? null
      : world.dirtyTiles.splice(0, world.dirtyTiles.length);

    if (full) {
      world.dirtyTiles.length = 0;
      for (let r = 0; r < world.rows; r++) {
        for (let c = 0; c < world.cols; c++) this.bakeTile(c, r);
      }
    } else if (tiles) {
      const seen = new Set<number>();
      for (const i of tiles) {
        // Rebake the tile and its neighbors (edge blending).
        const c = i % world.cols;
        const r = (i / world.cols) | 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const cc = c + dc;
            const rr = r + dr;
            if (cc < 0 || rr < 0 || cc >= world.cols || rr >= world.rows) continue;
            const idx = rr * world.cols + cc;
            if (!seen.has(idx)) {
              seen.add(idx);
              this.bakeTile(cc, rr);
            }
          }
        }
      }
    }
    this.bakeWaterMask();
    this.bakedVersion = world.terrainVersion;
  }

  private bakeTile(c: number, r: number): void {
    const world = this.sim.world;
    const i = r * world.cols + c;
    const biome = world.biomes[i] as Biome;
    const elev = world.elevation[i];
    const { base, accent } = BIOME_COLORS[biome];

    // Deterministic per-tile variation.
    const rng = mulberry32(i * 2654435761);
    const v = rng();
    let color = mixRgb(base, accent, v * 0.85);

    if (biome === Biome.Ocean) {
      // Depth shading: deeper = darker.
      const depth = clamp01((0.34 - elev) / 0.34);
      color = mixRgb(color, [4, 12, 38], depth * 0.85);
    } else if (biome !== Biome.Shore) {
      // Subtle elevation lighting on land.
      const lift = (elev - 0.4) * 0.55;
      color = mixRgb(color, lift > 0 ? [255, 255, 255] : [0, 0, 0], Math.abs(lift) * 0.35);
    }

    const ctx = this.bakedCtx;
    const x = c * TILE_SIZE;
    const y = r * TILE_SIZE;
    ctx.fillStyle = rgbToCss(color);
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

    // Organic edge blobs spilling into neighbor tiles break up the grid.
    for (let s = 0; s < 3; s++) {
      const bx = x + rng() * TILE_SIZE;
      const by = y + rng() * TILE_SIZE;
      ctx.beginPath();
      ctx.arc(bx, by, 3.5 + rng() * 5.5, 0, TAU);
      ctx.fill();
    }

    // Organic speckle texture.
    const speckles = biome === Biome.Forest ? 4 : 2;
    ctx.fillStyle = rgbToCss(mixRgb(color, accent, 0.9), 0.5);
    for (let s = 0; s < speckles; s++) {
      const sx = x + rng() * TILE_SIZE;
      const sy = y + rng() * TILE_SIZE;
      const sr = 1 + rng() * 2.4;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, TAU);
      ctx.fill();
    }
    // Snow caps on high mountains.
    if (biome === Biome.Mountain && elev > 0.86) {
      ctx.fillStyle = 'rgba(245,250,255,0.55)';
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    }
  }

  private bakeWaterMask(): void {
    const world = this.sim.world;
    const ctx = this.waterMask.getContext('2d')!;
    ctx.clearRect(0, 0, WORLD_W, WORLD_H);
    ctx.fillStyle = '#fff';
    for (let r = 0; r < world.rows; r++) {
      for (let c = 0; c < world.cols; c++) {
        if ((world.biomes[r * world.cols + c] as Biome) === Biome.Ocean) {
          ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }

  private makeCausticPattern(): HTMLCanvasElement {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    const rng = mulberry32(424242);
    ctx.strokeStyle = 'rgba(150,220,255,0.5)';
    for (let i = 0; i < 26; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 12 + rng() * 30;
      ctx.lineWidth = 1 + rng() * 1.6;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.5 + rng() * 0.5), rng() * TAU, 0, TAU);
      ctx.stroke();
    }
    return c;
  }

  // ---------------- per-frame layers ----------------

  private applyCameraTransform(ctx: CanvasRenderingContext2D, scale = 1): void {
    const cam = this.camera;
    const dpr = this.dpr * scale;
    const z = cam.dzoom * dpr;
    ctx.setTransform(
      z,
      0,
      0,
      z,
      dpr * (cam.viewportW / 2) - cam.dx * z,
      dpr * (cam.viewportH / 2) - cam.dy * z,
    );
  }

  private drawTerrainLayer(): void {
    const ctx = this.terrainCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05070e';
    ctx.fillRect(0, 0, this.terrainCanvas.width, this.terrainCanvas.height);

    this.applyCameraTransform(ctx);
    ctx.imageSmoothingEnabled = this.camera.dzoom < 1;
    ctx.drawImage(this.baked, 0, 0);

    // Animated water caustics, masked to ocean (half-res buffer).
    const fx = this.waterFxCtx;
    fx.setTransform(1, 0, 0, 1, 0, 0);
    fx.clearRect(0, 0, this.waterFx.width, this.waterFx.height);
    this.applyCameraTransform(fx, 0.5);
    fx.drawImage(this.waterMask, 0, 0);
    fx.globalCompositeOperation = 'source-in';
    const t = this.time;
    const pat = fx.createPattern(this.causticPattern, 'repeat')!;
    fx.globalAlpha = 0.22 + Math.sin(t * 1.2) * 0.05;
    const m = new DOMMatrix().translate(t * 9, Math.sin(t * 0.6) * 14);
    pat.setTransform(m);
    fx.fillStyle = pat;
    fx.fillRect(this.camera.dx - 4000, this.camera.dy - 4000, 8000, 8000);
    fx.globalAlpha = 1;
    fx.globalCompositeOperation = 'source-over';

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.waterFx, 0, 0, this.terrainCanvas.width, this.terrainCanvas.height);
  }

  private drawEntityLayer(dt: number): void {
    const ctx = this.entityCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.entityCanvas.width, this.entityCanvas.height);
    this.applyCameraTransform(ctx);
    // Crisp pixel-art sprites.
    ctx.imageSmoothingEnabled = false;

    const rect = this.camera.visibleRect();
    const pad = 30;
    const x0 = rect.x - pad;
    const y0 = rect.y - pad;
    const x1 = rect.x + rect.w + pad;
    const y1 = rect.y + rect.h + pad;
    const sim = this.sim;

    // Food.
    ctx.fillStyle = '#9fdf6a';
    for (const f of sim.world.foods) {
      if (f.x < x0 || f.x > x1 || f.y < y0 || f.y > y1) continue;
      const r = 1.4 + f.amount * 1.1;
      ctx.globalAlpha = Math.min(1, f.ttl / 12) * 0.9;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Fire (burning wildfire tiles).
    const burning = sim.events.burningTiles;
    if (burning.length > 0) {
      for (const b of burning) {
        const c = b.index % sim.world.cols;
        const r = (b.index / sim.world.cols) | 0;
        const bx = c * TILE_SIZE;
        const by = r * TILE_SIZE;
        if (bx < x0 - 16 || bx > x1 || by < y0 - 16 || by > y1) continue;
        const flicker = 0.55 + 0.45 * Math.sin(this.time * 11 + b.index * 1.7);
        ctx.fillStyle = `rgba(255,${90 + flicker * 90 | 0},30,${0.5 + flicker * 0.35})`;
        ctx.fillRect(bx, by, TILE_SIZE, TILE_SIZE);
        if (Math.random() < dt * 14) {
          this.particles.ember(bx + TILE_SIZE / 2, by + TILE_SIZE / 2);
        }
      }
    }

    // Death pops & birth sparkles queued by the sim.
    for (const d of sim.recentDeaths) this.particles.burst(d.x, d.y, 7, d.color, 55);
    sim.recentDeaths.length = 0;
    for (const b of sim.recentBirths) this.particles.burst(b.x, b.y, 5, '#fff7c0', 28);
    sim.recentBirths.length = 0;

    // Civilization structures (campfires, shrines, farms) under creatures.
    this.drawStructures(ctx, dt, x0, y0, x1, y1);

    // Creatures.
    const light = sim.lightLevel;
    for (const c of sim.creatures) {
      if (c.x < x0 || c.x > x1 || c.y < y0 || c.y > y1) continue;
      this.drawCreature(ctx, c, light);
    }

    // Ambient particles + bursts.
    this.particles.updateAmbient(sim.world, this.camera, dt, sim.isNight);
    this.particles.draw(ctx);

    // Meteor visuals.
    this.drawMeteor(ctx);

    // Day/night lighting overlay (screen space).
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const { color, darkness } = nightOverlay(sim.dayPhase);
    if (darkness > 0.01) {
      ctx.globalAlpha = darkness;
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, this.entityCanvas.width, this.entityCanvas.height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    // Brush preview + selection ring (world space, drawn above lighting).
    this.applyCameraTransform(ctx);
    this.drawBrush(ctx);
    this.drawSelection(ctx);
  }

  private drawCreature(ctx: CanvasRenderingContext2D, c: Creature, light: number): void {
    const color = this.sim.species.speciesColor(c.speciesId);
    const breathe = 1 + Math.sin(this.time * 3.4 + c.animPhase) * 0.06;
    // Keep creatures legible when zoomed out: enforce a min on-screen size.
    const r = Math.max(c.radius * breathe, 2.4 / this.camera.dzoom);
    const energyT = clamp01(c.energy / c.maxEnergy);
    // LOD: below this zoom a sprite is a smudge — draw colored dots instead.
    const useSprite = this.camera.dzoom >= 0.55;

    // Motion trail (sparser on low quality).
    const tr = c.trail;
    const trailStep = this.quality < 1 ? 4 : 2;
    if (tr.length >= 4) {
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      for (let i = trailStep; i < tr.length; i += trailStep) {
        const t = i / tr.length;
        ctx.globalAlpha = t * 0.22;
        ctx.lineWidth = r * t * 1.1;
        ctx.beginPath();
        ctx.moveTo(tr[i - trailStep], tr[i - trailStep + 1]);
        ctx.lineTo(tr[i], tr[i + 1]);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Energy/night glow halo.
    const nightGlow = c.genes.nocturnal > 0.6 && light < 0.45 ? 0.35 : 0;
    const glow = energyT * 0.22 + nightGlow;
    if (glow > 0.05) {
      ctx.globalAlpha = glow;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r * 2.1, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (useSprite) {
      // Pixel-art body: archetype sprite, flipped to face travel direction.
      const sp = this.sim.species.species[c.speciesId];
      const arch = (sp?.archetype ?? 'lizard') as ArchetypeId;
      const moving = Math.hypot(c.vx, c.vy) > c.maxSpeed * 0.18;
      const walkClock = this.time * (3 + c.maxSpeed * 0.09) + c.animPhase;
      const frame: 0 | 1 = moving && Math.sin(walkClock * TAU * 0.5) > 0 ? 1 : 0;
      // Humanoids in a tribe wear their era's clothing/tools.
      const sprite =
        arch === 'humanoid' && c.tribeId >= 0
          ? humanoidSprite(this.sim.culture.tribeEra(c.tribeId), c.genes.hue, frame)
          : getSprite(arch, c.genes.hue, frame);
      const scale = (r * 2.7) / sprite.width;
      const w = sprite.width * scale;
      const h = sprite.height * scale;
      const bob = moving ? Math.sin(walkClock * TAU * 0.5) * r * 0.07 : 0;
      const facingLeft = Math.cos(c.heading) < 0;

      // Ground shadow.
      ctx.fillStyle = 'rgba(5,8,16,0.3)';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + h * 0.42, w * 0.34, h * 0.12, 0, 0, TAU);
      ctx.fill();

      ctx.save();
      ctx.translate(c.x, c.y + bob);
      if (facingLeft) ctx.scale(-1, 1);
      ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
      ctx.restore();

      // Civilization flourishes: explorer flag, worship halo, speech.
      if (arch === 'humanoid' && c.tribeId >= 0) {
        this.drawHumanFlourishes(ctx, c, r);
      }

      // Plague tint.
      if (c.plagued) {
        ctx.globalAlpha = 0.35 + Math.sin(this.time * 8) * 0.15;
        ctx.fillStyle = '#76e07a';
        ctx.beginPath();
        ctx.arc(c.x, c.y, r * 0.9, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else {
      // Dot LOD for far zoom.
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(5,8,16,0.65)';
      ctx.lineWidth = Math.max(0.6, r * 0.12);
      ctx.stroke();
      if (c.plagued) {
        ctx.globalAlpha = 0.5 + Math.sin(this.time * 8) * 0.2;
        ctx.fillStyle = '#76e07a';
        ctx.beginPath();
        ctx.arc(c.x, c.y, r * 0.8, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Age ring: arc fills with age (visible when zoomed in).
    if (this.camera.dzoom > 0.8) {
      const ageT = clamp01(c.age / c.lifespan);
      ctx.strokeStyle = `rgba(255,255,255,${0.18 + ageT * 0.3})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r + 2, -Math.PI / 2, -Math.PI / 2 + ageT * TAU);
      ctx.stroke();
    }

    // Low-energy warning blink.
    if (energyT < 0.18) {
      ctx.globalAlpha = 0.4 + Math.sin(this.time * 10) * 0.3;
      ctx.strokeStyle = '#ff5d5d';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r + 3.5, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /** Explorer flag, worship halo and speech dots for a tribe humanoid. */
  private drawHumanFlourishes(
    ctx: CanvasRenderingContext2D,
    c: Creature,
    r: number,
  ): void {
    const tribe = this.sim.culture.tribe(c.tribeId);
    const tint = tribe?.color ?? '#fff';

    // Explorer: a little pennant flag above the head.
    if (c.explorer) {
      const fx = c.x;
      const fy = c.y - r - 6;
      ctx.strokeStyle = 'rgba(230,235,245,0.8)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx, fy + 6);
      ctx.stroke();
      ctx.fillStyle = tint;
      const wave = Math.sin(this.time * 6 + c.animPhase) * 1.2;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + 5 + wave, fy + 1.5);
      ctx.lineTo(fx, fy + 3);
      ctx.closePath();
      ctx.fill();
    }

    // Worship: a soft golden halo while gathered at the shrine.
    if (c.worshipping) {
      ctx.globalAlpha = 0.4 + Math.sin(this.time * 4 + c.animPhase) * 0.2;
      ctx.strokeStyle = '#ffe48a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(c.x, c.y - r - 2, 2.4, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Communication: occasional speech tick toward a nearby tribemate.
    if (this.camera.dzoom > 1.2 && !c.explorer && ((c.id + (this.time | 0)) % 5 === 0)) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(c.x + r * 0.8, c.y - r * 0.9, 0.9, 0, TAU);
      ctx.fill();
    }
  }

  /** Campfires, shrines and farm plots built by tribes. */
  private drawStructures(
    ctx: CanvasRenderingContext2D,
    dt: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): void {
    for (const s of this.sim.culture.structures) {
      if (s.x < x0 || s.x > x1 || s.y < y0 || s.y > y1) continue;
      if (s.type === 'campfire') {
        // Warm glow.
        const flick = 0.7 + Math.sin(this.time * 9 + s.id) * 0.3;
        const glow = ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, 34);
        glow.addColorStop(0, `rgba(255,170,70,${0.32 * flick})`);
        glow.addColorStop(1, 'rgba(255,150,60,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 34, 0, TAU);
        ctx.fill();
        // Log pile.
        ctx.fillStyle = 'hsl(28,52%,30%)';
        ctx.fillRect(s.x - 4, s.y + 1, 8, 2.5);
        // Flames.
        ctx.fillStyle = `rgba(255,${140 + flick * 80 | 0},40,0.95)`;
        ctx.beginPath();
        ctx.moveTo(s.x - 3, s.y + 1);
        ctx.quadraticCurveTo(s.x - 1, s.y - 6 * flick, s.x, s.y - 9 * flick);
        ctx.quadraticCurveTo(s.x + 1, s.y - 6 * flick, s.x + 3, s.y + 1);
        ctx.closePath();
        ctx.fill();
        if (Math.random() < dt * 9) this.particles.ember(s.x, s.y - 2);
      } else if (s.type === 'shrine') {
        // Totem with a faint sacred halo.
        ctx.globalAlpha = 0.18 + Math.sin(this.time * 1.5 + s.id) * 0.06;
        ctx.fillStyle = '#ffe9a8';
        ctx.beginPath();
        ctx.arc(s.x, s.y, 26, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        const tribe = this.sim.culture.tribe(s.tribeId);
        ctx.fillStyle = 'hsl(28,40%,26%)';
        ctx.fillRect(s.x - 3, s.y - 12, 6, 16);
        ctx.fillStyle = tribe?.color ?? '#caa';
        ctx.fillRect(s.x - 5, s.y - 14, 10, 4);
        ctx.fillStyle = '#ffd24a';
        ctx.beginPath();
        ctx.arc(s.x, s.y - 16, 2.2, 0, TAU);
        ctx.fill();
      } else {
        // Farm plot: tilled rows.
        ctx.fillStyle = 'hsl(30,42%,32%)';
        ctx.fillRect(s.x - 7, s.y - 5, 14, 10);
        ctx.fillStyle = 'hsl(96,40%,42%)';
        for (let i = -1; i <= 1; i++) {
          ctx.fillRect(s.x - 6, s.y + i * 3 - 1, 12, 1.2);
        }
      }
    }
  }

  private drawMeteor(ctx: CanvasRenderingContext2D): void {
    const m = this.sim.events.meteorVisual;
    if (!m) return;
    if (m.phase === 'incoming') {
      const t = m.t / 1.6;
      // Target reticle.
      ctx.strokeStyle = `rgba(255,90,60,${0.4 + Math.sin(this.time * 9) * 0.25})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.radius * (1.4 - t * 0.4), 0, TAU);
      ctx.stroke();
      // Falling streak.
      const fall = 1 - t;
      const sx = m.x + fall * 900;
      const sy = m.y - fall * 1400;
      const grad = ctx.createLinearGradient(sx, sy, m.x, m.y);
      grad.addColorStop(0, 'rgba(255,200,120,0)');
      grad.addColorStop(1, 'rgba(255,160,60,0.95)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(m.x + fall * 860, m.y - fall * 1330);
      ctx.stroke();
    } else if (m.phase === 'impact') {
      const t = clamp01((m.t - 1.6) / 1.4);
      // Flash + expanding shockwaves.
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.fillStyle = '#fff3d6';
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.radius * (0.4 + t * 0.7), 0, TAU);
      ctx.fill();
      for (let ring = 0; ring < 3; ring++) {
        const rt = clamp01(t * 1.4 - ring * 0.18);
        if (rt <= 0 || rt >= 1) continue;
        ctx.globalAlpha = (1 - rt) * 0.7;
        ctx.strokeStyle = '#ffb070';
        ctx.lineWidth = 5 * (1 - rt) + 1;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.radius * (0.5 + rt * 2.2), 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (Math.random() < 0.6) {
        this.particles.ember(
          m.x + (Math.random() - 0.5) * m.radius,
          m.y + (Math.random() - 0.5) * m.radius,
        );
      }
    }
  }

  private drawBrush(ctx: CanvasRenderingContext2D): void {
    const b = this.brush;
    if (!b.visible || b.tool === 'none' || b.tool === 'inspect') return;
    const colors: Record<string, string> = {
      terraform: 'rgba(120,220,140,0.8)',
      food: 'rgba(180,240,110,0.8)',
      kill: 'rgba(255,80,80,0.85)',
      spawn: 'rgba(140,180,255,0.85)',
    };
    ctx.strokeStyle = colors[b.tool] ?? 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.6 / this.camera.dzoom;
    ctx.setLineDash([6 / this.camera.dzoom, 5 / this.camera.dzoom]);
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.tool === 'spawn' || b.tool === 'food' ? 24 : b.radius, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawSelection(ctx: CanvasRenderingContext2D): void {
    const s = this.selected;
    if (!s || s.dead) return;
    const pulse = 1 + Math.sin(this.time * 5) * 0.12;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.4 / this.camera.dzoom;
    ctx.beginPath();
    ctx.arc(s.x, s.y, (s.radius + 6) * pulse, 0, TAU);
    ctx.stroke();
    // Vision radius hint.
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.effectiveVision(this.sim.lightLevel), 0, TAU);
    ctx.stroke();
  }
}
