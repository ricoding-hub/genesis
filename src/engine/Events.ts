import { ActiveEventInfo, Biome, EventType, GENE_KEYS, Genes } from '@/types';
import { pick, rand } from '@/utils/math';
import { Biome as B } from '@/types';
import { TILE_SIZE, World } from './World';
import type { Creature } from './Creature';

export interface MeteorVisual {
  x: number;
  y: number;
  radius: number;
  /** 'incoming' | 'impact' | 'aftermath' */
  phase: 'incoming' | 'impact' | 'aftermath';
  t: number;
}

interface BurningTile {
  index: number;
  fuel: number;
  spreadTimer: number;
}

abstract class SimEvent {
  abstract readonly type: EventType;
  done = false;
  abstract update(dt: number, world: World, creatures: Creature[]): void;
  abstract info(): ActiveEventInfo;
}

class MeteorEvent extends SimEvent {
  readonly type = 'meteor' as const;
  visual: MeteorVisual;
  private readonly incomingFor = 1.6;
  private readonly impactFor = 1.4;
  private elapsed = 0;
  private impacted = false;

  constructor(world: World) {
    super();
    // Aim at a random land tile so the crater is visible.
    let x = rand(0.2, 0.8) * world.cols * TILE_SIZE;
    let y = rand(0.2, 0.8) * world.rows * TILE_SIZE;
    for (let tries = 0; tries < 40; tries++) {
      const tx = rand(0.12, 0.88) * world.cols * TILE_SIZE;
      const ty = rand(0.12, 0.88) * world.rows * TILE_SIZE;
      if (world.isWalkable(tx, ty)) {
        x = tx;
        y = ty;
        break;
      }
    }
    this.visual = { x, y, radius: rand(110, 190), phase: 'incoming', t: 0 };
  }

  update(dt: number, world: World, creatures: Creature[]): void {
    this.elapsed += dt;
    this.visual.t = this.elapsed;

    if (this.elapsed < this.incomingFor) {
      this.visual.phase = 'incoming';
      return;
    }

    if (!this.impacted) {
      this.impacted = true;
      this.visual.phase = 'impact';
      const { x, y, radius } = this.visual;
      world.devastate(x, y, radius, 75);
      const r2 = radius * radius;
      for (const c of creatures) {
        const dx = c.x - x;
        const dy = c.y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < r2) {
          c.dead = true;
          c.deathCause = 'killed';
        } else if (d2 < r2 * 2.6) {
          // Shockwave: heavy energy loss and knockback.
          const d = Math.sqrt(d2) || 1;
          c.energy *= 0.45;
          c.vx += (dx / d) * 220;
          c.vy += (dy / d) * 220;
        }
      }
    }

    const sinceImpact = this.elapsed - this.incomingFor;
    this.visual.phase = sinceImpact < this.impactFor ? 'impact' : 'aftermath';
    if (sinceImpact > this.impactFor + 2.5) this.done = true;
  }

  info(): ActiveEventInfo {
    const total = this.incomingFor + this.impactFor + 2.5;
    return {
      type: this.type,
      progress: Math.min(1, this.elapsed / total),
      labelKey: this.visual.phase === 'incoming' ? 'meteorIncoming' : 'meteorImpact',
    };
  }
}

class IceAgeEvent extends SimEvent {
  readonly type = 'iceage' as const;
  private elapsed = 0;
  private readonly rampIn = 8;
  private readonly hold = 55;
  private readonly rampOut = 18;
  private freezeAccum = 0;

  get duration(): number {
    return this.rampIn + this.hold + this.rampOut;
  }

  update(dt: number, world: World, _creatures: Creature[]): void {
    this.elapsed += dt;
    const t = this.elapsed;
    let strength: number;
    if (t < this.rampIn) strength = t / this.rampIn;
    else if (t < this.rampIn + this.hold) strength = 1;
    else strength = Math.max(0, 1 - (t - this.rampIn - this.hold) / this.rampOut);

    world.globalTempShift = -0.55 * strength;

    // Tundra creep: convert random cold-ish tiles to tundra while strong.
    this.freezeAccum += dt * strength * 60;
    while (this.freezeAccum > 1) {
      this.freezeAccum -= 1;
      const i = (Math.random() * world.biomes.length) | 0;
      const biome = world.biomes[i] as Biome;
      if (biome === B.Grassland || biome === B.Forest || biome === B.Shore) {
        const col = i % world.cols;
        const row = (i / world.cols) | 0;
        world.convertTemporary(col, row, B.Tundra, this.duration - t + rand(5, 30));
      }
    }

    if (t >= this.duration) {
      world.globalTempShift = 0;
      this.done = true;
    }
  }

  info(): ActiveEventInfo {
    return {
      type: this.type,
      progress: Math.min(1, this.elapsed / this.duration),
      labelKey: 'iceage',
    };
  }
}

class WildfireEvent extends SimEvent {
  readonly type = 'wildfire' as const;
  burning: BurningTile[] = [];
  private burningSet = new Set<number>();
  private elapsed = 0;
  private readonly maxDuration = 75;
  private burnedCount = 0;

  constructor(world: World) {
    super();
    // Ignite a random forest tile.
    const forestTiles: number[] = [];
    for (let i = 0; i < world.biomes.length; i++) {
      if (world.biomes[i] === B.Forest) forestTiles.push(i);
    }
    if (forestTiles.length === 0) {
      this.done = true;
      return;
    }
    const start = pick(forestTiles);
    this.ignite(start);
    // Ignite a couple neighbors for a strong start.
    this.ignite(start + 1);
    this.ignite(start + world.cols);
  }

  private ignite(index: number): void {
    if (this.burningSet.has(index)) return;
    this.burningSet.add(index);
    this.burning.push({ index, fuel: rand(2.5, 4.5), spreadTimer: rand(0.4, 1) });
  }

  update(dt: number, world: World, creatures: Creature[]): void {
    this.elapsed += dt;
    const cols = world.cols;

    for (let i = this.burning.length - 1; i >= 0; i--) {
      const tile = this.burning[i];
      tile.fuel -= dt;
      tile.spreadTimer -= dt;
      world.hazard[tile.index] = 1;

      if (tile.spreadTimer <= 0) {
        tile.spreadTimer = rand(0.5, 1.2);
        // Try to spread to a random neighbor that is forest (or grass, slower).
        const neighbors = [
          tile.index - 1,
          tile.index + 1,
          tile.index - cols,
          tile.index + cols,
        ];
        for (const n of neighbors) {
          if (n < 0 || n >= world.biomes.length || this.burningSet.has(n)) continue;
          const b = world.biomes[n] as Biome;
          const p = b === B.Forest ? 0.5 : b === B.Grassland ? 0.12 : 0;
          if (Math.random() < p) this.ignite(n);
        }
      }

      if (tile.fuel <= 0) {
        // Burned out → wasteland with slow regrowth.
        const col = tile.index % cols;
        const row = (tile.index / cols) | 0;
        world.hazard[tile.index] = 0;
        world.setTile(col, row, B.Wasteland);
        world.convertTemporary(col, row, B.Forest, rand(60, 140));
        this.burningSet.delete(tile.index);
        this.burning.splice(i, 1);
        this.burnedCount++;
      }
    }

    // Burn food and creatures standing in fire.
    if (this.burningSet.size > 0) {
      world.foods = world.foods.filter(
        (f) => !this.burningSet.has(world.tileIndexAt(f.x, f.y)),
      );
      for (const c of creatures) {
        if (this.burningSet.has(world.tileIndexAt(c.x, c.y))) {
          c.energy -= 60 * dt;
          if (c.energy <= 0) {
            c.dead = true;
            c.deathCause = 'killed';
          }
        }
      }
    }

    if (this.burning.length === 0 || this.elapsed > this.maxDuration) {
      for (const t of this.burning) world.hazard[t.index] = 0;
      this.burning.length = 0;
      this.done = true;
    }
  }

  info(): ActiveEventInfo {
    return {
      type: this.type,
      progress: Math.min(1, this.elapsed / this.maxDuration),
      labelKey: 'wildfire',
      params: { n: this.burningSet.size },
    };
  }
}

class PlagueEvent extends SimEvent {
  readonly type = 'plague' as const;
  readonly gene: keyof Genes;
  readonly center: number;
  readonly band = 0.14;
  private elapsed = 0;
  private readonly duration = 45;
  infected = 0;

  constructor(creatures: Creature[]) {
    super();
    this.gene = pick(GENE_KEYS.filter((k) => k !== 'hue'));
    // Target the population's common gene value so the plague bites.
    if (creatures.length > 0) {
      const sample = pick(creatures);
      this.center = sample.genes[this.gene];
    } else {
      this.center = Math.random();
    }
  }

  update(dt: number, _world: World, creatures: Creature[]): void {
    this.elapsed += dt;
    this.infected = 0;
    const active = this.elapsed < this.duration;
    for (const c of creatures) {
      const inBand = Math.abs(c.genes[this.gene] - this.center) < this.band;
      c.plagued = active && inBand;
      if (c.plagued) this.infected++;
    }
    if (!active) {
      this.done = true;
    }
  }

  info(): ActiveEventInfo {
    return {
      type: this.type,
      progress: Math.min(1, this.elapsed / this.duration),
      labelKey: 'plague',
      params: { gene: this.gene, n: this.infected },
    };
  }
}

/** A drought: heat rises, food spawns dry up, some water recedes to shore. */
class DroughtEvent extends SimEvent {
  readonly type = 'drought' as const;
  private elapsed = 0;
  private readonly duration = 60;

  update(dt: number, world: World, _creatures: Creature[]): void {
    this.elapsed += dt;
    const t = this.elapsed;
    const strength =
      t < 6 ? t / 6 : t > this.duration - 12 ? Math.max(0, (this.duration - t) / 12) : 1;
    world.globalTempShift = 0.4 * strength;
    // Burn off existing food faster.
    if (world.foods.length > 0 && Math.random() < strength * 0.5) {
      world.foods.splice((Math.random() * world.foods.length) | 0, 1);
    }
    if (t >= this.duration) {
      world.globalTempShift = 0;
      this.done = true;
    }
  }
  info(): ActiveEventInfo {
    return { type: this.type, progress: Math.min(1, this.elapsed / this.duration), labelKey: 'drought' };
  }
}

/** A flood: shore and low land temporarily drown, then drain. */
class FloodEvent extends SimEvent {
  readonly type = 'flood' as const;
  private elapsed = 0;
  private readonly duration = 50;
  private accum = 0;

  update(dt: number, world: World, creatures: Creature[]): void {
    this.elapsed += dt;
    const rising = this.elapsed < this.duration * 0.55;
    if (rising) {
      this.accum += dt * 90;
      while (this.accum > 1) {
        this.accum -= 1;
        const i = (Math.random() * world.biomes.length) | 0;
        const b = world.biomes[i] as Biome;
        if (b === B.Shore || b === B.Swamp || b === B.Grassland) {
          const col = i % world.cols;
          const row = (i / world.cols) | 0;
          if (world.elevation[i] < 0.46) {
            world.convertTemporary(col, row, B.River, this.duration - this.elapsed + rand(4, 18));
          }
        }
      }
    }
    // Drown creatures caught in new water.
    for (const c of creatures) {
      if (!world.isWalkable(c.x, c.y) && world.biomeAt(c.x, c.y) === B.River) {
        c.energy -= 30 * dt;
        if (c.energy <= 0 && !c.dead) {
          c.dead = true;
          c.deathCause = 'killed';
        }
      }
    }
    if (this.elapsed >= this.duration) this.done = true;
  }
  info(): ActiveEventInfo {
    return { type: this.type, progress: Math.min(1, this.elapsed / this.duration), labelKey: 'flood' };
  }
}

/** An earthquake: brief, cracks open wasteland fissures and kills nearby. */
class EarthquakeEvent extends SimEvent {
  readonly type = 'earthquake' as const;
  shake = 0;
  private elapsed = 0;
  private readonly duration = 5;
  private done2 = false;

  update(dt: number, world: World, creatures: Creature[]): void {
    this.elapsed += dt;
    this.shake = Math.max(0, 1 - this.elapsed / this.duration);
    if (!this.done2 && this.elapsed > 0.4) {
      this.done2 = true;
      // Carve a few fissures (wasteland lines) and kill creatures on them.
      const fissures = 3;
      for (let f = 0; f < fissures; f++) {
        let x = rand(0.15, 0.85) * world.cols * TILE_SIZE;
        let y = rand(0.15, 0.85) * world.rows * TILE_SIZE;
        const ang = rand(0, Math.PI * 2);
        for (let s = 0; s < 40; s++) {
          world.devastate(x, y, rand(14, 26), rand(40, 90));
          for (const c of creatures) {
            const dx = c.x - x;
            const dy = c.y - y;
            if (dx * dx + dy * dy < 22 * 22 && Math.random() < 0.5) {
              c.dead = true;
              c.deathCause = 'killed';
            }
          }
          x += Math.cos(ang) * 24;
          y += Math.sin(ang) * 24;
        }
      }
    }
    if (this.elapsed >= this.duration) this.done = true;
  }
  info(): ActiveEventInfo {
    return { type: this.type, progress: Math.min(1, this.elapsed / this.duration), labelKey: 'earthquake' };
  }
}

/** A volcano: an eruption point spews lava (hazard) and ash, then cools. */
class VolcanoEvent extends SimEvent {
  readonly type = 'volcano' as const;
  cx: number;
  cy: number;
  radius = 0;
  private elapsed = 0;
  private readonly duration = 40;
  private erupted = false;

  constructor(world: World) {
    super();
    let x = rand(0.2, 0.8) * world.cols * TILE_SIZE;
    let y = rand(0.2, 0.8) * world.rows * TILE_SIZE;
    for (let i = 0; i < 40; i++) {
      const tx = rand(0.15, 0.85) * world.cols * TILE_SIZE;
      const ty = rand(0.15, 0.85) * world.rows * TILE_SIZE;
      if (world.isWalkable(tx, ty)) {
        x = tx;
        y = ty;
        break;
      }
    }
    this.cx = x;
    this.cy = y;
    this.radius = rand(70, 120);
  }

  update(dt: number, world: World, creatures: Creature[]): void {
    this.elapsed += dt;
    if (!this.erupted) {
      this.erupted = true;
      world.devastate(this.cx, this.cy, this.radius, 110);
      const r2 = this.radius * this.radius;
      for (const c of creatures) {
        const dx = c.x - this.cx;
        const dy = c.y - this.cy;
        if (dx * dx + dy * dy < r2) {
          c.dead = true;
          c.deathCause = 'killed';
        }
      }
    }
    // Lava hazard fades over the event.
    const lava = Math.max(0, 1 - this.elapsed / this.duration);
    const c0 = Math.floor((this.cx - this.radius) / TILE_SIZE);
    const c1 = Math.ceil((this.cx + this.radius) / TILE_SIZE);
    const r0 = Math.floor((this.cy - this.radius) / TILE_SIZE);
    const r1 = Math.ceil((this.cy + this.radius) / TILE_SIZE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (c < 0 || r < 0 || c >= world.cols || r >= world.rows) continue;
        const dx = c * TILE_SIZE + 8 - this.cx;
        const dy = r * TILE_SIZE + 8 - this.cy;
        if (dx * dx + dy * dy < this.radius * this.radius) {
          world.hazard[r * world.cols + c] = lava * 0.8;
        }
      }
    }
    if (this.elapsed >= this.duration) {
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (c < 0 || r < 0 || c >= world.cols || r >= world.rows) continue;
          world.hazard[r * world.cols + c] = 0;
        }
      }
      this.done = true;
    }
  }
  info(): ActiveEventInfo {
    return { type: this.type, progress: Math.min(1, this.elapsed / this.duration), labelKey: 'volcano' };
  }
}

/** A bloom: a burst of abundance — food rains across the land. */
class BloomEvent extends SimEvent {
  readonly type = 'bloom' as const;
  private elapsed = 0;
  private readonly duration = 35;

  update(dt: number, world: World, _creatures: Creature[]): void {
    this.elapsed += dt;
    // Sprinkle bonus food on walkable land.
    const drops = 40;
    for (let i = 0; i < drops; i++) {
      const x = Math.random() * world.cols * TILE_SIZE;
      const y = Math.random() * world.rows * TILE_SIZE;
      if (world.isWalkable(x, y) && Math.random() < dt * 1.4) {
        world.spawnFood(x, y, rand(1, 1.6));
      }
    }
    if (this.elapsed >= this.duration) this.done = true;
  }
  info(): ActiveEventInfo {
    return { type: this.type, progress: Math.min(1, this.elapsed / this.duration), labelKey: 'bloom' };
  }
}

/** A locust swarm: a moving cloud that strips food and crops. */
class LocustEvent extends SimEvent {
  readonly type = 'locust' as const;
  x: number;
  y: number;
  private vx = rand(-40, 40);
  private vy = rand(-40, 40);
  private elapsed = 0;
  private readonly duration = 45;
  stripped = 0;

  constructor(world: World) {
    super();
    this.x = rand(0.2, 0.8) * world.cols * TILE_SIZE;
    this.y = rand(0.2, 0.8) * world.rows * TILE_SIZE;
  }

  update(dt: number, world: World, _creatures: Creature[]): void {
    this.elapsed += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const w = world.cols * TILE_SIZE;
    const h = world.rows * TILE_SIZE;
    if (this.x < 0 || this.x > w) this.vx *= -1;
    if (this.y < 0 || this.y > h) this.vy *= -1;
    // Devour food within the swarm radius.
    const r2 = 70 * 70;
    const before = world.foods.length;
    world.foods = world.foods.filter((f) => {
      const dx = f.x - this.x;
      const dy = f.y - this.y;
      return dx * dx + dy * dy > r2;
    });
    this.stripped += before - world.foods.length;
    if (this.elapsed >= this.duration) this.done = true;
  }
  info(): ActiveEventInfo {
    return {
      type: this.type,
      progress: Math.min(1, this.elapsed / this.duration),
      labelKey: 'locust',
      params: { n: this.stripped },
    };
  }
}

/** A solar eclipse: daylight is briefly snuffed out. */
class EclipseEvent extends SimEvent {
  readonly type = 'eclipse' as const;
  darkness = 0;
  private elapsed = 0;
  private readonly duration = 24;

  update(dt: number, _world: World, _creatures: Creature[]): void {
    this.elapsed += dt;
    const t = this.elapsed / this.duration;
    // Ramp to full dark at mid-event, then back.
    this.darkness = Math.sin(Math.min(1, t) * Math.PI);
    if (this.elapsed >= this.duration) {
      this.darkness = 0;
      this.done = true;
    }
  }
  info(): ActiveEventInfo {
    return { type: this.type, progress: Math.min(1, this.elapsed / this.duration), labelKey: 'eclipse' };
  }
}

export class EventManager {
  active: SimEvent[] = [];

  trigger(type: EventType, world: World, creatures: Creature[]): void {
    // One instance of each type at a time.
    if (this.active.some((e) => e.type === type)) return;
    switch (type) {
      case 'meteor':
        this.active.push(new MeteorEvent(world));
        break;
      case 'iceage':
        this.active.push(new IceAgeEvent());
        break;
      case 'wildfire':
        this.active.push(new WildfireEvent(world));
        break;
      case 'plague':
        this.active.push(new PlagueEvent(creatures));
        break;
      case 'drought':
        this.active.push(new DroughtEvent());
        break;
      case 'flood':
        this.active.push(new FloodEvent());
        break;
      case 'earthquake':
        this.active.push(new EarthquakeEvent());
        break;
      case 'volcano':
        this.active.push(new VolcanoEvent(world));
        break;
      case 'bloom':
        this.active.push(new BloomEvent());
        break;
      case 'locust':
        this.active.push(new LocustEvent(world));
        break;
      case 'eclipse':
        this.active.push(new EclipseEvent());
        break;
    }
  }

  update(dt: number, world: World, creatures: Creature[]): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      e.update(dt, world, creatures);
      if (e.done) {
        if (e.type === 'plague') {
          for (const c of creatures) c.plagued = false;
        }
        this.active.splice(i, 1);
      }
    }
  }

  infos(): ActiveEventInfo[] {
    return this.active.map((e) => e.info());
  }

  get meteorVisual(): MeteorVisual | null {
    const m = this.active.find((e) => e.type === 'meteor') as MeteorEvent | undefined;
    return m ? m.visual : null;
  }

  get burningTiles(): BurningTile[] {
    const w = this.active.find((e) => e.type === 'wildfire') as WildfireEvent | undefined;
    return w ? w.burning : [];
  }

  get iceAgeActive(): boolean {
    return this.active.some((e) => e.type === 'iceage');
  }

  /** Extra screen darkness from an eclipse, 0..1. */
  get eclipseDarkness(): number {
    const e = this.active.find((x) => x.type === 'eclipse') as EclipseEvent | undefined;
    return e ? e.darkness : 0;
  }

  /** Screen shake amplitude from an earthquake, 0..1. */
  get quakeShake(): number {
    const e = this.active.find((x) => x.type === 'earthquake') as EarthquakeEvent | undefined;
    return e ? e.shake : 0;
  }

  get volcano(): { x: number; y: number; radius: number } | null {
    const e = this.active.find((x) => x.type === 'volcano') as VolcanoEvent | undefined;
    return e ? { x: e.cx, y: e.cy, radius: e.radius } : null;
  }

  get locust(): { x: number; y: number } | null {
    const e = this.active.find((x) => x.type === 'locust') as LocustEvent | undefined;
    return e ? { x: e.x, y: e.y } : null;
  }
}
