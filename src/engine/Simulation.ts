import {
  Biome,
  CohortOptions,
  CreatureInfo,
  Era,
  EventType,
  Genes,
  Scenario,
  Sex,
  StatsSnapshot,
  VersusMatchup,
  VersusSideStats,
  VersusState,
} from '@/types';
import { clamp01, pick, rand, TAU } from '@/utils/math';
import { Creature } from './Creature';
import { Culture } from './Culture';
import { EventManager } from './Events';
import {
  cloneGenes,
  cohortGenes,
  crossover,
  geneDistance,
  mutate,
  randomGenes,
} from './Genetics';
import { SpatialGrid } from './SpatialGrid';
import { ageYears, expectancyYears } from '@/utils/time';

/** Events the random scheduler may fire (skews toward drama, some boons). */
const RANDOM_EVENT_POOL: EventType[] = [
  'meteor',
  'wildfire',
  'drought',
  'flood',
  'earthquake',
  'volcano',
  'plague',
  'locust',
  'eclipse',
  'bloom',
  'bloom',
  'iceage',
];
import { SpeciesTracker } from './Species';
import { StatsCollector } from './Stats';
import { Food, World, WORLD_H, WORLD_W } from './World';

/** A genome that reliably maps to the humanoid archetype (high vision+efficiency). */
export function humanoidGenes(): Genes {
  return {
    speed: rand(0.5, 0.7),
    size: rand(0.4, 0.6),
    vision: rand(0.78, 0.95),
    hue: rand(0.05, 0.12), // warm skin tones
    diet: rand(0.3, 0.5),
    efficiency: rand(0.78, 0.95),
    reproThreshold: rand(0.45, 0.6),
    mutationRate: rand(0.15, 0.3),
    lifespan: rand(0.6, 0.85),
    nocturnal: rand(0.15, 0.4),
  };
}

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
  culture = new Culture();

  worldAge = 0;
  paused = false;
  speed: SimSpeed = 1;
  fps = 60;

  /** Random catastrophe scheduler. */
  randomEvents = true;
  private randomEventTimer = rand(60, 140);

  // Versus / Arena state.
  versusActive = false;
  versusMatchup: VersusMatchup = 'menVsWomen';
  versusWallX = WORLD_W / 2;

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
      // Guarantee one humanoid-leaning founder cluster so civilization can rise.
      const founder = k === 0 ? humanoidGenes() : randomGenes();
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
    const night = this.isNight;
    const humanoids: Creature[] = [];
    for (const c of this.creatures) {
      if (c.dead) continue;
      const isHuman = this.isHumanoid(c);
      if (isHuman) humanoids.push(c);
      // Civilization perks (humanoids only): tools speed foraging, fire cooks.
      const civFood =
        isHuman && c.tribeId >= 0
          ? this.culture.toolBonus(c.tribeId) * this.culture.cookingBonusAt(c.x, c.y)
          : 1;
      c.update(
        dt,
        this.world,
        this.creatureGrid,
        this.foodGrid,
        light,
        (food, bite) => {
          const taken = Math.min(food.amount, bite);
          food.amount -= taken;
          c.gainFromFood(taken * civFood);
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
      // Warmth: a campfire staves off the cold of night.
      if (night) {
        const warmth = this.culture.warmthAt(c.x, c.y);
        if (warmth > 0) c.energy = Math.min(c.maxEnergy, c.energy + warmth * 3.5 * dt);
      }
    }

    // Civilization layer: tribes, knowledge, eras, structures.
    this.culture.update(dt, humanoids, this.creatureGrid, this.world, this.worldAge);

    // Reproduction pass.
    if (this.creatures.length < MAX_CREATURES) {
      for (const c of this.creatures) {
        if (c.dead || !c.canReproduce()) continue;
        const cHuman = this.isHumanoid(c);
        const searchR = c.radius + 16;
        let partner: Creature | null = null;
        this.creatureGrid.query(c.x, c.y, searchR, (other) => {
          if (other === c || other.dead || other.id < c.id) return; // pair once
          if (!other.canReproduce()) return;
          if (geneDistance(c.genes, other.genes) > MATE_COMPATIBILITY) return;
          // Humanoids reproduce sexually: need a male and a female.
          if (cHuman && this.isHumanoid(other) && other.sex === c.sex) return;
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

    // Random events: occasionally the world throws a curveball.
    if (this.randomEvents) {
      this.randomEventTimer -= dt;
      if (this.randomEventTimer <= 0) {
        this.randomEventTimer = rand(75, 160);
        this.triggerEvent(pick(RANDOM_EVENT_POOL));
      }
    }

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
    // Children are born into a parent's tribe; some become pioneers.
    const parentTribe = a.tribeId >= 0 ? a.tribeId : b.tribeId;
    if (parentTribe >= 0 && this.isHumanoid(child)) {
      child.tribeId = parentTribe;
      child.explorer = child.genes.vision > 0.62 && child.genes.speed > 0.55 && Math.random() < 0.18;
      child.name = this.culture.nameFor(parentTribe, child.sex);
    }
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

  /** A creature whose species belongs to the humanoid archetype. */
  isHumanoid(c: Creature): boolean {
    return this.species.species[c.speciesId]?.archetype === 'humanoid';
  }

  // ---------------- God mode API ----------------

  paintBiome(x: number, y: number, radius: number, biome: Biome): void {
    this.world.paintBiome(x, y, radius, biome);
  }

  /** Found a humanoid tribe at a point (God tool). */
  spawnTribe(x: number, y: number): boolean {
    if (!this.world.isWalkable(x, y)) return false;
    const members: Creature[] = [];
    for (let i = 0; i < 7 && this.creatures.length < MAX_CREATURES; i++) {
      let px = x + rand(-40, 40);
      let py = y + rand(-40, 40);
      if (!this.world.isWalkable(px, py)) {
        px = x;
        py = y;
      }
      const c = new Creature(px, py, humanoidGenes(), this.stats.generation);
      c.energy = c.maxEnergy * 0.85;
      this.species.assign(c, this.worldAge, c.generation);
      this.creatures.push(c);
      members.push(c);
    }
    if (members.length === 0) return false;
    this.culture.foundTribeAt(x, y, members, this.worldAge);
    return true;
  }

  /** Spawn one humanoid with explicit genes & sex; assigns species. */
  private makeHumanoid(x: number, y: number, genes: Genes, sex: Sex): Creature {
    const c = new Creature(x, y, genes, this.stats.generation, [-1, -1], sex);
    c.energy = c.maxEnergy * 0.82;
    this.species.assign(c, this.worldAge, c.generation);
    this.creatures.push(c);
    return c;
  }

  /** God tool: place a custom cohort of humans, forming one tribe. */
  spawnCohort(x: number, y: number, opts: CohortOptions): boolean {
    if (!this.world.isWalkable(x, y)) return false;
    const members: Creature[] = [];
    for (let i = 0; i < opts.count && this.creatures.length < MAX_CREATURES; i++) {
      let px = x + rand(-55, 55);
      let py = y + rand(-55, 55);
      if (!this.world.isWalkable(px, py)) {
        px = x;
        py = y;
      }
      const sex: Sex = opts.sex === 'mixed' ? (i % 2 === 0 ? 'M' : 'F') : opts.sex;
      members.push(this.makeHumanoid(px, py, cohortGenes(opts.profile), sex));
    }
    if (members.length === 0) return false;
    this.culture.foundTribeAt(x, y, members, this.worldAge);
    return true;
  }

  dropFood(x: number, y: number): void {
    this.world.spawnFoodCluster(x, y, 16, 55);
    // Feeding a tribe near here earns their favor.
    const id = this.culture.nearestTribeId(x, y, 220);
    if (id >= 0) this.culture.addFavor(id, 6);
  }

  // ---- Walls & divine powers ----

  paintWall(x: number, y: number, radius: number): void {
    this.world.paintWall(x, y, radius, true);
  }
  eraseWall(x: number, y: number, radius: number): void {
    this.world.paintWall(x, y, radius, false);
  }

  /** Bless an area: rain food, heal, and earn favor. Returns tribe name. */
  bless(x: number, y: number, radius = 90): string | null {
    this.world.spawnFoodCluster(x, y, 26, radius * 0.7);
    const r2 = radius * radius;
    for (const c of this.creatures) {
      const dx = c.x - x;
      const dy = c.y - y;
      if (dx * dx + dy * dy < r2) c.energy = Math.min(c.maxEnergy, c.energy + c.maxEnergy * 0.4);
    }
    this.particlesBurst(x, y, '#ffe48a');
    return this.culture.onBlessing(x, y, this.worldAge);
  }

  /** Smite a spot: a bolt kills in a small radius, scattering the rest. */
  smite(x: number, y: number, radius = 60): string | null {
    const r2 = radius * radius;
    for (const c of this.creatures) {
      const dx = c.x - x;
      const dy = c.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < r2) {
        c.dead = true;
        c.deathCause = 'killed';
      } else if (d2 < r2 * 4) {
        const d = Math.sqrt(d2) || 1;
        c.vx += (dx / d) * 160;
        c.vy += (dy / d) * 160;
        c.energy *= 0.7;
      }
    }
    return this.culture.onSmite(x, y, this.worldAge);
  }

  /** Queue a particle burst for the renderer (reuses the death channel). */
  private particlesBurst(x: number, y: number, color: string): void {
    if (this.recentDeaths.length < 40) this.recentDeaths.push({ x, y, color });
  }

  /** Send a "bible" bearing a name; the nearest tribe adopts it as sacred. */
  sendBible(x: number, y: number, name: string): string | null {
    const trimmed = name.trim();
    if (!trimmed) return null;
    this.particlesBurst(x, y, '#ffe48a');
    return this.culture.receiveBible(x, y, trimmed, this.worldAge);
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
    const tribe = c.tribeId >= 0 ? this.culture.tribe(c.tribeId) : undefined;
    const archetype = this.species.species[c.speciesId]?.archetype ?? 'lizard';
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
      archetype,
      children: c.children,
      sex: c.sex,
      ageYears: ageYears(archetype, c.genes.lifespan, c.age, c.lifespan),
      expectancyYears: expectancyYears(archetype, c.genes.lifespan),
      name: c.name,
      tribeName: tribe?.name ?? null,
      tribeEra: tribe ? this.culture.tribeEra(c.tribeId) : null,
      deity: tribe?.deity ?? null,
      explorer: c.explorer,
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
      tribes: this.culture.tribeInfos(),
      civLog: this.culture.log_(),
      versus: this.versusActive ? this.versusState() : null,
    };
  }

  // ---- Versus / Arena ----

  private versusSideStats(side: 0 | 1, color: string): VersusSideStats {
    const wallX = this.versusWallX;
    let pop = 0;
    let sizeSum = 0;
    let intelSum = 0;
    for (const c of this.creatures) {
      const onLeft = c.x < wallX;
      if ((side === 0) !== onLeft) continue;
      pop++;
      sizeSum += c.genes.size;
      intelSum += (c.genes.vision + c.genes.efficiency) / 2;
    }
    // Era/knowledge: best tribe whose settlement sits on this side.
    let era = 0;
    let knowledge = 0;
    for (const t of this.culture.tribeInfos()) {
      const tx = this.culture.tribe(t.id)?.settlement.x ?? wallX;
      const onLeft = tx < wallX;
      if ((side === 0) === onLeft) {
        era = Math.max(era, t.era);
        knowledge = Math.max(knowledge, t.knowledge);
      }
    }
    return {
      population: pop,
      era,
      knowledge: Math.round(knowledge),
      avgSize: pop ? sizeSum / pop : 0,
      avgIntel: pop ? intelSum / pop : 0,
      color,
    };
  }

  versusState(): VersusState {
    return {
      active: this.versusActive,
      matchup: this.versusMatchup,
      left: this.versusSideStats(0, '#5fa8ff'),
      right: this.versusSideStats(1, '#ff6f91'),
    };
  }

  /** Build a central wall and seed two competing cohorts. */
  startVersus(matchup: VersusMatchup): void {
    this.reset('genesis', true);
    this.versusActive = true;
    this.versusMatchup = matchup;
    this.randomEvents = false;
    const wallX = WORLD_W / 2;
    this.versusWallX = wallX;
    this.world.buildVerticalWall(wallX);

    const seedSide = (side: 0 | 1, genesFn: () => Genes, sex: Sex | 'mixed') => {
      const members: Creature[] = [];
      let cx = 0;
      let cy = 0;
      for (let tries = 0; tries < 4000 && members.length < 22; tries++) {
        const x =
          side === 0 ? rand(0.08, 0.42) * WORLD_W : rand(0.58, 0.92) * WORLD_W;
        const y = rand(0.12, 0.88) * WORLD_H;
        if (!this.world.isWalkable(x, y)) continue;
        const s: Sex = sex === 'mixed' ? (members.length % 2 === 0 ? 'M' : 'F') : sex;
        const c = this.makeHumanoid(x, y, genesFn(), s);
        members.push(c);
        cx += x;
        cy += y;
      }
      // Each side starts as its own tribe so the scoreboard tracks them apart.
      if (members.length > 0) {
        this.culture.foundTribeAt(cx / members.length, cy / members.length, members, this.worldAge);
      }
    };

    switch (matchup) {
      case 'menVsWomen':
        seedSide(0, () => cohortGenes('balanced'), 'M');
        seedSide(1, () => cohortGenes('balanced'), 'F');
        break;
      case 'smartVsStrong':
        seedSide(0, () => cohortGenes('smart'), 'mixed');
        seedSide(1, () => cohortGenes('strong'), 'mixed');
        break;
      case 'nightVsDay':
        seedSide(0, () => cohortGenes('nocturnal'), 'mixed');
        seedSide(1, () => {
          const g = cohortGenes('balanced');
          g.nocturnal = rand(0.02, 0.12);
          return g;
        }, 'mixed');
        break;
      case 'herbVsCarn':
        seedSide(0, () => {
          const g = cohortGenes('balanced');
          g.diet = rand(0, 0.15);
          return g;
        }, 'mixed');
        seedSide(1, () => {
          const g = cohortGenes('strong');
          g.diet = rand(0.85, 1);
          return g;
        }, 'mixed');
        break;
    }
    this.species.refresh(this.creatures);
  }

  endVersus(): void {
    this.versusActive = false;
    this.randomEvents = true;
    this.world.clearWalls();
  }

  /** Rebuild the world for a scenario (in place; renderer/camera keep refs). */
  reset(scenario: Scenario, keepVersusFlags = false): void {
    if (!keepVersusFlags) {
      this.versusActive = false;
      this.randomEvents = true;
    }
    this.world = new World();
    this.creatures = [];
    this.species = new SpeciesTracker();
    this.culture = new Culture();
    this.events = new EventManager();
    this.stats = new StatsCollector();
    this.worldAge = 0;
    this.creatureGrid = new SpatialGrid<Creature>(WORLD_W, WORLD_H, 80);
    this.foodGrid = new SpatialGrid<Food>(WORLD_W, WORLD_H, 80);

    if (scenario === 'genesis') {
      this.seed(SEED_CREATURES);
      for (let i = 0; i < 240; i++) this.world.update(1, 2.2);
    } else if (scenario === 'advanced') {
      this.seedAdvanced();
    } else if (scenario === 'arena') {
      this.startVersus(this.versusMatchup);
    }
  }

  /** Preloaded "Advanced Humans" world: several already-civilized tribes. */
  private seedAdvanced(): void {
    // A little ambient wildlife too.
    this.seed(SEED_CREATURES);
    for (let i = 0; i < 200; i++) this.world.update(1, 2.2);
    this.worldAge = 3600; // the world is already old
    // Found several tribes and jump them straight to the Age of Faith.
    for (let t = 0; t < 4; t++) {
      const pos = this.randomLandPosition();
      this.spawnCohort(pos.x, pos.y, { count: 16, sex: 'mixed', profile: 'smart' });
    }
    for (const tribe of this.culture.tribes.values()) {
      this.culture.forceEra(tribe.id, Era.Faith, this.worldAge);
    }
    // A few hundred ticks to settle: build temples, farms, gather worshippers.
    const prevPaused = this.paused;
    this.paused = false;
    for (let i = 0; i < 1200; i++) this.tick(TICK);
    this.paused = prevPaused;
  }
}
