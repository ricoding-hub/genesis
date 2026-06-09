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
      label: this.visual.phase === 'incoming' ? 'Meteor incoming…' : 'Meteor impact!',
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
      label: 'Ice age — global temperatures plummet',
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
      label: `Wildfire — ${this.burningSet.size} tiles burning`,
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
      label: `Plague targets "${this.gene}" gene — ${this.infected} infected`,
    };
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
}
