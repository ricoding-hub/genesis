import { Biome, CreatureInfo, EventType, Genes, StatsSnapshot } from '@/types';
import { clamp01, rand, TAU } from '@/utils/math';
import { Creature } from './Creature';
import { EventManager } from './Events';
import { cloneGenes, crossover, geneDistance, mutate, randomGenes } from './Genetics';
import { SpatialGrid } from './SpatialGrid';
import { SpeciesTracker } from './Species';
import { StatsCollector } from './Stats';
import { Food, World, WORLD_H, WORLD_W } from './World';

export const TICK = 1 / 30;
const DAY_LENGTH = 90; // sim-seconds per full day/night cycle
const MAX_CREATURES = 700;
const SEED_CREATURES = 32;
/** Max genetic distance between viable mates. */
const MATE_COMPATIBILITY = 0.3;

export type SimSpeed = 1 | 2 | 5 | 10;

/** Light level for a phase of day: 1 = noon, 0 = midnight. */
export function lightLevelAt(dayPhase: number): number {
  return clamp01(Math.cos((dayPhase - 0.25) * TAU) * 0.65 + 0.55);
}

/**
 * Owns the whole simulation state and the fixed-timestep update. The
 * renderer and React UI read from it; god-mode tools call into it.
 */
export class Simulation {
  world = new World();
  creatures: Creature[] = [];
  creatureGrid = new SpatialGrid<Creature>(WORLD_W, WORLD_H, 80);
  foodGrid = new SpatialGrid<Food>(WORLD_W, WORLD_H, 80);
  species = new SpeciesTracker();
  events = new EventManager();
  stats = new StatsCollector();

  worldAge = 0;
  paused = false;
  speed: SimSpeed = 1;
  fps = 60;

  /** Death positions for the renderer to pop a particle burst. */
  recentDeaths: { x: number; y: number; color: string }[] = [];
  /** Birth positions for a soft sparkle. */
  recentBirths: { x: number; y: number }[] = [];

  private accumulator = 0;
  private sampleTimer = 0;
  private extinctionTimer = 0;

  constructor() {
    this.seed(SEED_CREATURES);
    // Pre-warm food so the first generation can eat.
    for (let i = 0; i < 240; i++) this.world.update(1, 2.2);
  }

  get dayPhase(): number {
    return (this.worldAge / DAY_LENGTH) % 1;
  }

  get lightLevel(): number {
    return lightLevelAt(this.dayPhase);
  }

  get isNight(): boolean {
    return this.lightLevel < 0.35;
  }

  /**
   * Seed `n` creatures as a handful of founder clusters: each cluster
   * shares a jittered copy of one genome, so early populations have
   * compatible mates and species form meaningful groups.
   */
  seed(n: number): void {
    const clusters = Math.max(1, Math.round(n / 8));
    for (let k = 0; k < clusters; k++) {
      const founder = randomGenes();
      const home = this.randomLandPosition();
      const members = Math.ceil(n / clusters);
      for (let i = 0; i < members; i++) {
        const genes = mutate(cloneGenes(founder));
        let x = home.x + rand(-90, 90);
        let y = home.y + rand(-90, 90);
        if (!this.world.isWalkable(x, y)) {
          const p = this.randomLandPosition();
          x = p.x;
          y = p.y;
        }
        const c = new Creature(x, y, genes);
        this.species.assign(c, this.worldAge, 0);
        this.creatures.push(c);
      }
    }
    this.species.refresh(this.creatures);
  }

  private randomLandPosition(): { x: number; y: number } {
    for (let tries = 0; tries < 200; tries++) {
      const x = rand(0.08, 0.92) * WORLD_W;
      const y = rand(0.08, 0.92) * WORLD_H;
      if (this.world.isWalkable(x, y)) return { x, y };
    }
    return { x: WORLD_W / 2, y: WORLD_H / 2 };
  }

  /** Advance simulation by real elapsed seconds (scaled by speed). */
  advance(realDt: number): void {
    if (this.paused) return;
    this.accumulator += Math.min(realDt, 0.1) * this.speed;
    // Cap ticks per frame so heavy speeds degrade gracefully.
    let ticks = 0;
    const maxTicks = this.speed * 2 + 2;
    while (this.accumulator >= TICK && ticks < maxTicks) {
      this.tick(TICK);
      this.accumulator -= TICK;
      ticks++;
    }
    if (ticks >= maxTicks) this.accumulator = 0;
  }

  /** Advance exactly one tick (step mode). */
  stepOnce(): void {
    this.tick(TICK);
  }

  private tick(dt: number): void {
    this.worldAge += dt;
    const light = this.lightLevel;

    const foodMultiplier = this.events.iceAgeActive ? 0.35 : 1;
    this.world.update(dt, foodMultiplier);

    // Rebuild spatial grids.
    this.creatureGrid.clear();
    for (const c of this.creatures) this.creatureGrid.insert(c);
    this.foodGrid.clear();
    for (const f of this.world.foods) this.foodGrid.insert(f);

    // Update creatures.
    for (const c of this.creatures) {
      if (c.dead) continue;
      c.update(
        dt,
        this.world,
        this.creatureGrid,
        this.foodGrid,
        light,
        (food, bite) => {
          const taken = Math.min(food.amount, bite);
          food.amount -= taken;
          c.gainFromFood(taken);
        },
        (prey, damage) => {
          prey.energy -= damage;
          if (prey.energy <= 0 && !prey.dead) {
            prey.dead = true;
            prey.deathCause = 'eaten';
            c.gainFromMeat(prey.maxEnergy, prey.radius);
          }
        },
      );
      // Standing in hazard (fire, shock zone) hurts.
      const hz = this.world.hazardAt(c.x, c.y);
      if (hz > 0) c.energy -= hz * 50 * dt;
    }

    // Reproduction pass.
    if (this.creatures.length < MAX_CREATURES) {
      for (const c of this.creatures) {
        if (c.dead || !c.canReproduce()) continue;
        const searchR = c.radius + 16;
        let partner: Creature | null = null;
        this.creatureGrid.query(c.x, c.y, searchR, (other) => {
          if (other === c || other.dead || other.id < c.id) return; // pair once
          if (!other.canReproduce()) return;
          if (geneDistance(c.genes, other.genes) > MATE_COMPATIBILITY) return;
          partner = other;
          return true;
        });
        if (partner) this.reproduce(c, partner);
        if (this.creatures.length >= MAX_CREATURES) break;
      }
    }

    // Remove the dead.
    let w = 0;
    for (let i = 0; i < this.creatures.length; i++) {
      const c = this.creatures[i];
      if (c.energy <= 0 && !c.dead) {
        c.dead = true;
        c.deathCause = 'starved';
      }
      if (c.dead) {
        this.stats.recordDeath();
        if (this.recentDeaths.length < 40) {
          this.recentDeaths.push({
            x: c.x,
            y: c.y,
            color: this.species.speciesColor(c.speciesId),
          });
        }
        // Carcass becomes a bit of food.
        if (c.deathCause !== 'eaten' && Math.random() < 0.5) {
          this.world.spawnFood(c.x, c.y, c.radius * 0.18);
        }
        continue;
      }
      this.creatures[w++] = c;
    }
    this.creatures.length = w;

    // Events.
    this.events.update(dt, this.world, this.creatures);

    // Periodic bookkeeping.
    this.sampleTimer += dt;
    if (this.sampleTimer >= 2) {
      this.sampleTimer = 0;
      this.species.refresh(this.creatures);
      this.stats.sample(this.worldAge, this.creatures, this.species);
    }

    // Genesis safety net: after total extinction, life finds a way.
    if (this.creatures.length === 0) {
      this.extinctionTimer += dt;
      if (this.extinctionTimer > 8) {
        this.extinctionTimer = 0;
        this.seed(SEED_CREATURES / 2);
      }
    } else {
      this.extinctionTimer = 0;
    }
  }

  private reproduce(a: Creature, b: Creature): void {
    const genes = mutate(crossover(a.genes, b.genes));
    const generation = Math.max(a.generation, b.generation) + 1;
    const x = (a.x + b.x) / 2 + rand(-6, 6);
    const y = (a.y + b.y) / 2 + rand(-6, 6);
    const child = new Creature(x, y, genes, generation, [a.id, b.id]);
    child.energy = child.maxEnergy * 0.4;
    this.species.assign(child, this.worldAge, generation);
    this.creatures.push(child);

    const cost = 0.34;
    a.energy -= a.maxEnergy * cost;
    b.energy -= b.maxEnergy * cost;
    a.reproCooldown = 7 + rand(0, 4);
    b.reproCooldown = 7 + rand(0, 4);
    a.children++;
    b.children++;

    this.stats.recordBirth(generation);
    if (this.recentBirths.length < 40) this.recentBirths.push({ x, y });
  }

  // ---------------- God mode API ----------------

  paintBiome(x: number, y: number, radius: number, biome: Biome): void {
    this.world.paintBiome(x, y, radius, biome);
  }

  dropFood(x: number, y: number): void {
    this.world.spawnFoodCluster(x, y, 16, 55);
  }

  killZone(x: number, y: number, radius: number): void {
    const r2 = radius * radius;
    for (const c of this.creatures) {
      const dx = c.x - x;
      const dy = c.y - y;
      if (dx * dx + dy * dy < r2) {
        c.dead = true;
        c.deathCause = 'killed';
      }
    }
  }

  spawnCreature(x: number, y: number, genes?: Genes): Creature | null {
    if (!this.world.isWalkable(x, y) || this.creatures.length >= MAX_CREATURES) {
      return null;
    }
    const g = genes ? cloneGenes(genes) : randomGenes();
    const c = new Creature(x, y, g, this.stats.generation);
    c.energy = c.maxEnergy * 0.8;
    this.species.assign(c, this.worldAge, c.generation);
    this.creatures.push(c);
    return c;
  }

  triggerEvent(type: EventType): void {
    this.events.trigger(type, this.world, this.creatures);
  }

  /** Find the creature nearest to a world point (for the inspector). */
  creatureAt(x: number, y: number, maxDist = 18): Creature | null {
    let best: Creature | null = null;
    let bestD2 = maxDist * maxDist;
    this.creatureGrid.query(x, y, maxDist, (c, d2) => {
      if (d2 < bestD2) {
        bestD2 = d2;
        best = c;
      }
    });
    return best;
  }

  creatureInfo(c: Creature): CreatureInfo {
    return {
      id: c.id,
      genes: { ...c.genes },
      energy: c.energy,
      maxEnergy: c.maxEnergy,
      age: c.age,
      lifespan: c.lifespan,
      stage: c.stage,
      generation: c.generation,
      speciesId: c.speciesId,
      speciesColor: this.species.speciesColor(c.speciesId),
      children: c.children,
    };
  }

  snapshot(): StatsSnapshot {
    return {
      population: this.creatures.length,
      foodCount: this.world.foods.length,
      generation: this.stats.generation,
      worldAge: this.worldAge,
      dayPhase: this.dayPhase,
      isNight: this.isNight,
      births: this.stats.births,
      deaths: this.stats.deaths,
      fps: Math.round(this.fps),
      speed: this.speed,
      paused: this.paused,
      popSeries: [...this.stats.popSeries],
      diversitySeries: [...this.stats.diversitySeries],
      histograms: this.stats.histograms(this.creatures),
      species: this.species.species.map((s) => ({ ...s })),
      dominant: this.stats.dominant(this.creatures, this.species),
      activeEvents: this.events.infos(),
    };
  }
}
