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
  private lastWorld: unknown = null;
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
    // A scenario reset swaps in a fresh World → force a full re-bake.
    if (world !== this.lastWorld) {
      this.lastWorld = world;
      this.bakedVersion = -1;
    }
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

    // Biome doodads: scattered mini-sprites that give each biome character.
    if (biome !== Biome.Wasteland && !this.sim.world.walls[i]) {
      this.bakeDoodad(ctx, biome, x, y, rng);
    }

    // God-built wall: stone block with a bevel, drawn over the biome.
    if (this.sim.world.walls[i]) {
      ctx.fillStyle = '#5a5550';
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(x, y, TILE_SIZE, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(x, y + TILE_SIZE - 3, TILE_SIZE, 3);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    }
  }

  /**
   * Scatter a small, biome-specific decoration into the baked terrain: trees,
   * cacti, flowers, reeds, boulders… Deterministic per tile via `rng`, low
   * probability so the world stays readable.
   */
  private bakeDoodad(
    ctx: CanvasRenderingContext2D,
    biome: Biome,
    x: number,
    y: number,
    rng: () => number,
  ): void {
    const roll = rng();
    const px = x + 3 + rng() * (TILE_SIZE - 6);
    const py = y + 4 + rng() * (TILE_SIZE - 7);

    const tree = (trunk: string, canopy: string, h: number, w: number) => {
      ctx.fillStyle = trunk;
      ctx.fillRect(px - 0.8, py, 1.6, h * 0.5);
      ctx.fillStyle = canopy;
      ctx.beginPath();
      ctx.arc(px, py - h * 0.2, w, 0, TAU);
      ctx.fill();
    };
    const pine = (canopy: string, h: number) => {
      ctx.fillStyle = '#4a3a28';
      ctx.fillRect(px - 0.7, py, 1.4, h * 0.35);
      ctx.fillStyle = canopy;
      ctx.beginPath();
      ctx.moveTo(px, py - h);
      ctx.lineTo(px - h * 0.42, py);
      ctx.lineTo(px + h * 0.42, py);
      ctx.closePath();
      ctx.fill();
    };
    const tuft = (color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.8;
      for (let k = -1; k <= 1; k++) {
        ctx.beginPath();
        ctx.moveTo(px + k, py + 2);
        ctx.lineTo(px + k * 1.4, py - 2.5);
        ctx.stroke();
      }
    };
    const rock = (color: string, s: number) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(px, py, s, s * 0.7, 0, 0, TAU);
      ctx.fill();
    };

    switch (biome) {
      case Biome.Forest:
        if (roll < 0.5) pine(rng() < 0.5 ? '#214a2a' : '#2c5e36', 7 + rng() * 3);
        else if (roll < 0.62) tree('#4a3a28', '#356b3c', 7, 3 + rng() * 1.5);
        break;
      case Biome.Jungle:
        if (roll < 0.6) tree('#5a4326', rng() < 0.5 ? '#1f6b34' : '#2c7a3c', 8, 3.5 + rng() * 2);
        else if (roll < 0.78) tuft('#2f8c45');
        break;
      case Biome.Grassland:
        if (roll < 0.16)
          rock(rng() < 0.33 ? '#e8d24a' : rng() < 0.5 ? '#e87aa0' : '#9a7ae8', 1.4);
        else if (roll < 0.4) tuft('#6fae54');
        break;
      case Biome.Savanna:
        if (roll < 0.12) {
          // Acacia: flat-topped tree.
          ctx.fillStyle = '#6a5326';
          ctx.fillRect(px - 0.8, py - 1, 1.6, 5);
          ctx.fillStyle = '#7d8c3a';
          ctx.beginPath();
          ctx.ellipse(px, py - 2, 4.5, 1.8, 0, 0, TAU);
          ctx.fill();
        } else if (roll < 0.42) tuft('#b0a44e');
        break;
      case Biome.Desert:
        if (roll < 0.1) {
          // Saguaro cactus.
          ctx.fillStyle = '#3f7d3a';
          ctx.fillRect(px - 1, py - 5, 2, 8);
          ctx.fillRect(px - 3, py - 2, 2, 1.6);
          ctx.fillRect(px - 3, py - 4, 1.6, 2.4);
          ctx.fillRect(px + 1, py - 1, 2, 1.6);
          ctx.fillRect(px + 2.6, py - 3, 1.6, 2.4);
        } else if (roll < 0.16) rock('#caa86a', 1.6);
        break;
      case Biome.Tundra:
        if (roll < 0.22) pine('#5a7a66', 6 + rng() * 2);
        else if (roll < 0.34) rock('#cfdbe2', 1.8);
        break;
      case Biome.Mountain:
        if (roll < 0.3) rock(rng() < 0.5 ? '#8a8480' : '#6b6560', 2 + rng() * 1.5);
        break;
      case Biome.Swamp:
        if (roll < 0.4) tuft(rng() < 0.5 ? '#3c6e3a' : '#587a3a');
        else if (roll < 0.5) rock('#3a5a3e', 1.6);
        break;
      case Biome.Shore:
        if (roll < 0.06) tree('#6a5326', '#3a7d44', 6, 2.5); // lone palm
        else if (roll < 0.12) rock('#e8dcc0', 1.2); // shell/pebble
        break;
      default:
        break;
    }
  }

  /** Food appearance varies by biome: berries, grain, mushrooms, fruit… */
  private drawFoodSprite(
    ctx: CanvasRenderingContext2D,
    biome: Biome,
    x: number,
    y: number,
    r: number,
  ): void {
    const dot = (color: string, rr = r) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, TAU);
      ctx.fill();
    };
    switch (biome) {
      case Biome.Forest:
      case Biome.Jungle:
        // Berry cluster (three red dots).
        ctx.fillStyle = '#e0563f';
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1.4]] as const) {
          ctx.beginPath();
          ctx.arc(x + dx * r * 0.8, y + dy * r * 0.8, r * 0.7, 0, TAU);
          ctx.fill();
        }
        break;
      case Biome.Grassland:
      case Biome.Savanna:
        // Golden grain.
        dot('#e8c84a');
        break;
      case Biome.Desert:
        // Cactus fruit (magenta).
        dot('#d65a9a');
        break;
      case Biome.Tundra:
        // Frost berries (blue).
        dot('#6aa0e0');
        break;
      case Biome.Swamp:
        // Mushroom: stem + red cap.
        ctx.fillStyle = '#e8e0d0';
        ctx.fillRect(x - 0.6, y, 1.2, r);
        ctx.fillStyle = '#d05050';
        ctx.beginPath();
        ctx.arc(x, y, r * 0.95, Math.PI, TAU);
        ctx.fill();
        break;
      default:
        dot('#9fdf6a');
        break;
    }
  }

  private bakeWaterMask(): void {
    const world = this.sim.world;
    const ctx = this.waterMask.getContext('2d')!;
    ctx.clearRect(0, 0, WORLD_W, WORLD_H);
    ctx.fillStyle = '#fff';
    for (let r = 0; r < world.rows; r++) {
      for (let c = 0; c < world.cols; c++) {
        const b = world.biomes[r * world.cols + c] as Biome;
        if (b === Biome.Ocean || b === Biome.River) {
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
    // Earthquake screen shake.
    const q = this.sim.events.quakeShake;
    const sx = q > 0 ? Math.sin(this.time * 60) * q * 6 * dpr : 0;
    const sy = q > 0 ? Math.cos(this.time * 53) * q * 6 * dpr : 0;
    ctx.setTransform(
      z,
      0,
      0,
      z,
      dpr * (cam.viewportW / 2) - cam.dx * z + sx,
      dpr * (cam.viewportH / 2) - cam.dy * z + sy,
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

    // Food — colored/shaped by the biome it grew in (berries, grain, fungi…).
    const drawFood = this.camera.dzoom > 0.6;
    for (const f of sim.world.foods) {
      if (f.x < x0 || f.x > x1 || f.y < y0 || f.y > y1) continue;
      const r = 1.4 + f.amount * 1.1;
      ctx.globalAlpha = Math.min(1, f.ttl / 12) * 0.95;
      if (drawFood) {
        this.drawFoodSprite(ctx, sim.world.biomeAt(f.x, f.y), f.x, f.y, r);
      } else {
        ctx.fillStyle = '#9fdf6a';
        ctx.beginPath();
        ctx.arc(f.x, f.y, r, 0, TAU);
        ctx.fill();
      }
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

    // Meteor + new event visuals.
    this.drawMeteor(ctx);
    this.drawEventFx(ctx, dt);

    // Day/night lighting overlay (screen space), deepened by any eclipse.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const { color, darkness } = nightOverlay(sim.dayPhase);
    const eclipse = sim.events.eclipseDarkness;
    const totalDark = Math.min(0.92, darkness + eclipse * 0.82);
    if (totalDark > 0.01) {
      ctx.globalAlpha = totalDark;
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = eclipse > 0.05 ? '#0a0a16' : color;
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
      // Humanoids wear their tribe era's clothing/tools (Stone if tribeless).
      const sprite =
        arch === 'humanoid'
          ? humanoidSprite(
              c.tribeId >= 0 ? this.sim.culture.tribeEra(c.tribeId) : 0,
              c.genes.hue,
              c.sex,
              frame,
            )
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

    // Praying to YOU: rising golden motes above the head at the temple.
    if (c.praying) {
      const rise = (this.time * 14 + c.animPhase * 6) % 12;
      ctx.globalAlpha = Math.max(0, 1 - rise / 12) * 0.9;
      ctx.fillStyle = '#ffe48a';
      ctx.beginPath();
      ctx.arc(c.x + Math.sin(c.animPhase + this.time) * 1.5, c.y - r - 3 - rise, 1, 0, TAU);
      ctx.fill();
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
      } else if (s.type === 'temple') {
        // A temple to YOU: stone base, columns, golden idol + holy beam.
        ctx.globalAlpha = 0.16 + Math.sin(this.time * 1.2 + s.id) * 0.06;
        const beam = ctx.createLinearGradient(s.x, s.y - 60, s.x, s.y);
        beam.addColorStop(0, 'rgba(255,228,138,0)');
        beam.addColorStop(1, 'rgba(255,228,138,0.5)');
        ctx.fillStyle = beam;
        ctx.fillRect(s.x - 8, s.y - 60, 16, 60);
        ctx.globalAlpha = 1;
        // Base + steps.
        ctx.fillStyle = '#cdbfa6';
        ctx.fillRect(s.x - 14, s.y, 28, 6);
        ctx.fillStyle = '#e8dcc2';
        ctx.fillRect(s.x - 12, s.y - 12, 24, 12);
        // Columns.
        ctx.fillStyle = '#f3ecdc';
        for (let cxn = -9; cxn <= 9; cxn += 6) ctx.fillRect(s.x + cxn - 1, s.y - 12, 2.5, 12);
        // Pediment.
        ctx.fillStyle = '#d8cab0';
        ctx.beginPath();
        ctx.moveTo(s.x - 14, s.y - 12);
        ctx.lineTo(s.x, s.y - 22);
        ctx.lineTo(s.x + 14, s.y - 12);
        ctx.closePath();
        ctx.fill();
        // Golden idol (you).
        ctx.fillStyle = '#ffd24a';
        ctx.beginPath();
        ctx.arc(s.x, s.y - 6, 2.4, 0, TAU);
        ctx.fill();
        if (Math.random() < dt * 4) this.particles.burst(s.x, s.y - 14, 1, '#ffe48a', 12);
      } else if (s.type === 'altar') {
        // Sacrificial altar: stone block with a blood-red bowl.
        ctx.fillStyle = '#7a7068';
        ctx.fillRect(s.x - 6, s.y - 4, 12, 8);
        ctx.fillStyle = '#5a5048';
        ctx.fillRect(s.x - 6, s.y + 2, 12, 2);
        ctx.fillStyle = `rgba(180,30,30,${0.6 + Math.sin(this.time * 3 + s.id) * 0.2})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y - 4, 2, 0, TAU);
        ctx.fill();
      } else {
        // Farm plot: tilled rows with sprouting wheat that sways.
        ctx.fillStyle = 'hsl(30,42%,32%)';
        ctx.fillRect(s.x - 7, s.y - 5, 14, 10);
        ctx.fillStyle = 'hsl(96,40%,42%)';
        for (let i = -1; i <= 1; i++) {
          ctx.fillRect(s.x - 6, s.y + i * 3 - 1, 12, 1.2);
        }
        // Wheat tufts (taller as the plot ages).
        const grow = Math.min(1, s.phase / 12);
        ctx.strokeStyle = 'hsl(48,68%,55%)';
        ctx.lineWidth = 0.7;
        for (let wxn = -5; wxn <= 5; wxn += 3) {
          const sway = Math.sin(this.time * 2 + wxn + s.id) * 1.2;
          ctx.beginPath();
          ctx.moveTo(s.x + wxn, s.y + 4);
          ctx.lineTo(s.x + wxn + sway, s.y + 4 - 6 * grow);
          ctx.stroke();
        }
      }
    }
  }

  /** Volcano lava glow and locust swarm clouds (world space). */
  private drawEventFx(ctx: CanvasRenderingContext2D, dt: number): void {
    const volcano = this.sim.events.volcano;
    if (volcano) {
      const glow = ctx.createRadialGradient(
        volcano.x,
        volcano.y,
        4,
        volcano.x,
        volcano.y,
        volcano.radius,
      );
      const pulse = 0.5 + Math.sin(this.time * 6) * 0.2;
      glow.addColorStop(0, `rgba(255,120,30,${0.5 * pulse})`);
      glow.addColorStop(0.5, `rgba(220,60,20,${0.3 * pulse})`);
      glow.addColorStop(1, 'rgba(120,20,10,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(volcano.x, volcano.y, volcano.radius, 0, TAU);
      ctx.fill();
      if (Math.random() < dt * 30) {
        this.particles.ember(
          volcano.x + (Math.random() - 0.5) * volcano.radius,
          volcano.y + (Math.random() - 0.5) * volcano.radius,
        );
      }
    }

    const locust = this.sim.events.locust;
    if (locust) {
      ctx.fillStyle = 'rgba(60,50,20,0.5)';
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * TAU + this.time * 3;
        const rr = 20 + ((i * 7) % 50);
        ctx.beginPath();
        ctx.arc(
          locust.x + Math.cos(a) * rr + Math.sin(this.time * 8 + i) * 4,
          locust.y + Math.sin(a) * rr + Math.cos(this.time * 7 + i) * 4,
          1.3,
          0,
          TAU,
        );
        ctx.fill();
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
