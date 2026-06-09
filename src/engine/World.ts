import { Biome, BiomeParams } from '@/types';
import { SimplexNoise } from '@/utils/noise';
import { clamp01, rand } from '@/utils/math';

export const TILE_SIZE = 16;
export const WORLD_COLS = 220;
export const WORLD_ROWS = 150;
export const WORLD_W = WORLD_COLS * TILE_SIZE;
export const WORLD_H = WORLD_ROWS * TILE_SIZE;

export const BIOME_PARAMS: Record<Biome, BiomeParams> = {
  [Biome.Ocean]: { foodRate: 0.004, temperature: 0.45, moveCost: 3.2, walkable: false },
  [Biome.Shore]: { foodRate: 0.012, temperature: 0.55, moveCost: 1.15, walkable: true },
  [Biome.Grassland]: { foodRate: 0.028, temperature: 0.6, moveCost: 1.0, walkable: true },
  [Biome.Forest]: { foodRate: 0.038, temperature: 0.5, moveCost: 1.25, walkable: true },
  [Biome.Desert]: { foodRate: 0.005, temperature: 0.92, moveCost: 1.3, walkable: true },
  [Biome.Tundra]: { foodRate: 0.008, temperature: 0.12, moveCost: 1.35, walkable: true },
  [Biome.Mountain]: { foodRate: 0.006, temperature: 0.25, moveCost: 1.9, walkable: true },
  [Biome.Wasteland]: { foodRate: 0.001, temperature: 0.65, moveCost: 1.2, walkable: true },
};

export interface Food {
  id: number;
  x: number;
  y: number;
  /** Nutritional value remaining. */
  amount: number;
  /** Remaining seconds before decay. */
  ttl: number;
}

/**
 * Tile-based world: biomes from layered noise, food spawning/decay,
 * terraform support and post-disaster regeneration.
 */
export class World {
  readonly cols = WORLD_COLS;
  readonly rows = WORLD_ROWS;
  readonly biomes: Uint8Array;
  readonly elevation: Float32Array;
  /** Per-tile hazard level (fire, meteor shock). Creatures steer away from it. */
  readonly hazard: Float32Array;
  /** Per-tile temperature offset applied by events (ice age). */
  globalTempShift = 0;
  /** Tiles flagged for slow regeneration back to their pre-disaster biome. */
  private regen = new Map<number, { target: Biome; timer: number }>();

  foods: Food[] = [];
  private nextFoodId = 1;
  /** Incremented whenever any tile changes, so the renderer can re-bake. */
  terrainVersion = 0;
  /** Dirty tile indices since last renderer bake (empty means full redraw). */
  dirtyTiles: number[] = [];

  /** Food cap scales with biome richness; soft global cap for perf. */
  private readonly maxFood = 2600;

  constructor(seed = (Math.random() * 1e9) | 0) {
    this.biomes = new Uint8Array(this.cols * this.rows);
    this.elevation = new Float32Array(this.cols * this.rows);
    this.hazard = new Float32Array(this.cols * this.rows);
    this.generate(seed);
  }

  private generate(seed: number): void {
    const elevNoise = new SimplexNoise(seed);
    const moistNoise = new SimplexNoise(seed ^ 0x9e3779b9);
    const tempNoise = new SimplexNoise(seed ^ 0x517cc1b7);

    const cx = this.cols / 2;
    const cy = this.rows / 2;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const i = r * this.cols + c;
        const nx = c / this.cols - 0.5;
        const ny = r / this.rows - 0.5;

        // Radial falloff keeps oceans at the map edge → island-ish continents.
        const dx = (c - cx) / cx;
        const dy = (r - cy) / cy;
        const edge = Math.sqrt(dx * dx + dy * dy);
        const falloff = clamp01(1.25 - edge * 1.05);

        let e = elevNoise.fbm(nx * 4.2, ny * 4.2, 5) * 0.5 + 0.5;
        e = clamp01(e * falloff + 0.04);
        const m = moistNoise.fbm(nx * 3.1 + 40, ny * 3.1 + 40, 4) * 0.5 + 0.5;
        // Latitude gradient + noise → cold poles.
        const lat = Math.abs(ny) * 2;
        const t = clamp01(
          1 - lat * 0.85 + tempNoise.fbm(nx * 2.5 - 80, ny * 2.5 - 80, 3) * 0.25,
        );

        this.elevation[i] = e;
        this.biomes[i] = this.classify(e, m, t);
      }
    }
    this.terrainVersion++;
  }

  private classify(e: number, m: number, t: number): Biome {
    if (e < 0.34) return Biome.Ocean;
    if (e < 0.385) return Biome.Shore;
    if (e > 0.78) return Biome.Mountain;
    if (t < 0.28) return Biome.Tundra;
    if (t > 0.72 && m < 0.42) return Biome.Desert;
    if (m > 0.52) return Biome.Forest;
    return Biome.Grassland;
  }

  tileIndexAt(x: number, y: number): number {
    const c = clamp01(x / WORLD_W) * (this.cols - 1);
    const r = clamp01(y / WORLD_H) * (this.rows - 1);
    return Math.round(r) * this.cols + Math.round(c);
  }

  biomeAt(x: number, y: number): Biome {
    return this.biomes[this.tileIndexAt(x, y)] as Biome;
  }

  paramsAt(x: number, y: number): BiomeParams {
    return BIOME_PARAMS[this.biomeAt(x, y)];
  }

  temperatureAt(x: number, y: number): number {
    return clamp01(this.paramsAt(x, y).temperature + this.globalTempShift);
  }

  isWalkable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return false;
    return this.paramsAt(x, y).walkable;
  }

  hazardAt(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return 0;
    return this.hazard[this.tileIndexAt(x, y)];
  }

  /** Temporarily convert a tile to another biome, restoring the old one later. */
  convertTemporary(col: number, row: number, biome: Biome, duration: number): void {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return;
    const i = row * this.cols + col;
    const prev = this.biomes[i] as Biome;
    if (prev === biome || prev === Biome.Ocean) return;
    if (!this.regen.has(i)) this.regen.set(i, { target: prev, timer: duration });
    else this.regen.get(i)!.timer = Math.max(this.regen.get(i)!.timer, duration);
    this.biomes[i] = biome;
    this.dirtyTiles.push(i);
    this.terrainVersion++;
  }

  setTile(col: number, row: number, biome: Biome): void {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return;
    const i = row * this.cols + col;
    if (this.biomes[i] === biome) return;
    this.biomes[i] = biome;
    this.dirtyTiles.push(i);
    this.terrainVersion++;
  }

  /** Paint a circular brush of a biome, in world coordinates. */
  paintBiome(x: number, y: number, radius: number, biome: Biome): void {
    const c0 = Math.floor((x - radius) / TILE_SIZE);
    const c1 = Math.ceil((x + radius) / TILE_SIZE);
    const r0 = Math.floor((y - radius) / TILE_SIZE);
    const r1 = Math.ceil((y + radius) / TILE_SIZE);
    const r2 = radius * radius;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const tx = c * TILE_SIZE + TILE_SIZE / 2;
        const ty = r * TILE_SIZE + TILE_SIZE / 2;
        const dx = tx - x;
        const dy = ty - y;
        if (dx * dx + dy * dy <= r2) this.setTile(c, r, biome);
      }
    }
  }

  /** Convert an area to wasteland and schedule slow regrowth. */
  devastate(x: number, y: number, radius: number, regenAfter = 60): void {
    const c0 = Math.floor((x - radius) / TILE_SIZE);
    const c1 = Math.ceil((x + radius) / TILE_SIZE);
    const r0 = Math.floor((y - radius) / TILE_SIZE);
    const r1 = Math.ceil((y + radius) / TILE_SIZE);
    const r2 = radius * radius;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
        const tx = c * TILE_SIZE + TILE_SIZE / 2;
        const ty = r * TILE_SIZE + TILE_SIZE / 2;
        const dx = tx - x;
        const dy = ty - y;
        if (dx * dx + dy * dy > r2) continue;
        const i = r * this.cols + c;
        const prev = this.biomes[i] as Biome;
        if (prev === Biome.Ocean || prev === Biome.Wasteland) continue;
        this.regen.set(i, {
          target: prev,
          timer: regenAfter * (0.6 + Math.random() * 0.8),
        });
        this.biomes[i] = Biome.Wasteland;
        this.dirtyTiles.push(i);
      }
    }
    // Remove food inside the blast.
    this.foods = this.foods.filter((f) => {
      const dx = f.x - x;
      const dy = f.y - y;
      return dx * dx + dy * dy > r2;
    });
    this.terrainVersion++;
  }

  spawnFood(x: number, y: number, amount = 1): Food | null {
    if (this.foods.length >= this.maxFood) return null;
    const food: Food = {
      id: this.nextFoodId++,
      x,
      y,
      amount,
      ttl: rand(40, 90),
    };
    this.foods.push(food);
    return food;
  }

  /** Drop a cluster of food around a point (god tool). */
  spawnFoodCluster(x: number, y: number, count = 14, spread = 60): void {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const d = rand(0, spread);
      const fx = x + Math.cos(a) * d;
      const fy = y + Math.sin(a) * d;
      if (this.isWalkable(fx, fy)) this.spawnFood(fx, fy, rand(0.8, 1.4));
    }
  }

  update(dt: number, foodMultiplier = 1): void {
    // Organic food spawning: sample random tiles; spawn proportional to biome rate.
    const samples = 110;
    if (this.foods.length < this.maxFood) {
      for (let s = 0; s < samples; s++) {
        const i = (Math.random() * this.biomes.length) | 0;
        const biome = this.biomes[i] as Biome;
        const params = BIOME_PARAMS[biome];
        if (!params.walkable) continue;
        // Cold suppresses growth (ice age effect).
        const cold = clamp01(params.temperature + this.globalTempShift) < 0.12 ? 0.15 : 1;
        const p = params.foodRate * dt * (this.biomes.length / samples) * foodMultiplier * cold;
        if (Math.random() < p) {
          const c = i % this.cols;
          const r = (i / this.cols) | 0;
          this.spawnFood(
            (c + Math.random()) * TILE_SIZE,
            (r + Math.random()) * TILE_SIZE,
            rand(0.7, 1.3),
          );
        }
      }
    }

    // Food decay.
    if (this.foods.length > 0) {
      let w = 0;
      for (let i = 0; i < this.foods.length; i++) {
        const f = this.foods[i];
        f.ttl -= dt;
        if (f.ttl > 0 && f.amount > 0.05) this.foods[w++] = f;
      }
      this.foods.length = w;
    }

    // Wasteland regeneration.
    if (this.regen.size > 0) {
      for (const [i, info] of this.regen) {
        info.timer -= dt;
        if (info.timer <= 0) {
          this.biomes[i] = info.target;
          this.dirtyTiles.push(i);
          this.terrainVersion++;
          this.regen.delete(i);
        }
      }
    }
  }
}
