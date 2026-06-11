import { Genes, LifeStage, Sex } from '@/types';
import { clamp, clamp01, lerp, rand, TAU } from '@/utils/math';
import {
  decodeLifespan,
  decodeMaxEnergy,
  decodeSize,
  decodeSpeed,
  decodeVision,
} from './Genetics';
import type { Food, World } from './World';
import type { SpatialGrid } from './SpatialGrid';

let nextId = 1;

const INFANT_UNTIL = 0.08;
const JUVENILE_UNTIL = 0.2;
const ELDER_FROM = 0.82;

/** Fraction of lifespan at which a creature reaches full body size. */
const GROWN_AT = 0.25;

export class Creature {
  readonly id = nextId++;
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  heading = rand(0, TAU);

  genes: Genes;
  energy: number;
  age = 0;
  generation: number;
  speciesId = -1;
  parentIds: [number, number];
  children = 0;
  dead = false;
  deathCause: 'starved' | 'age' | 'eaten' | 'killed' | null = null;

  // Decoded phenotype (cached; genes never change after birth).
  readonly maxSpeed: number;
  readonly adultRadius: number;
  readonly vision: number;
  readonly maxEnergy: number;
  readonly lifespan: number;

  /** Reproduction cooldown in seconds. */
  reproCooldown = 0;
  /** Wander steering state. */
  private wanderAngle = rand(0, TAU);
  /** Per-creature phase offset for breathing animation. */
  readonly animPhase = rand(0, TAU);
  /** Plague infection flag (set by the plague event). */
  plagued = false;
  /** Recent positions (x,y pairs) for motion trails. */
  trail: number[] = [];
  private trailTimer = 0;

  // ---- Civilization (humanoids only; managed by Culture) ----
  /** Tribe membership, -1 = none. */
  tribeId = -1;
  /** "First penguin" — ventures into the unknown for the tribe. */
  explorer = false;
  /** Culture-driven destination (settlement / shrine / frontier). */
  cultureGoal: { x: number; y: number } | null = null;
  /** Set true while gathered at a shrine, for the worship visual. */
  worshipping = false;
  /** Biological sex; only constrains reproduction for humanoids. */
  readonly sex: Sex;
  /** Praying to the player-god (temple) — for the prayer visual. */
  praying = false;
  /** Personal name, given by their tribe's culture (humanoids only). */
  name: string | null = null;

  constructor(
    x: number,
    y: number,
    genes: Genes,
    generation = 0,
    parentIds: [number, number] = [-1, -1],
    sex: Sex = Math.random() < 0.5 ? 'M' : 'F',
  ) {
    this.x = x;
    this.y = y;
    this.genes = genes;
    this.generation = generation;
    this.parentIds = parentIds;
    this.sex = sex;
    // Subtle sexual dimorphism: males a touch larger & faster, females a
    // touch more efficient & longer-lived. Tiny so it never dominates genes.
    const male = sex === 'M';
    this.maxSpeed = decodeSpeed(genes) * (male ? 1.04 : 0.98);
    this.adultRadius = decodeSize(genes) * (male ? 1.06 : 0.95);
    this.vision = decodeVision(genes);
    this.maxEnergy = decodeMaxEnergy(genes) * (male ? 1.0 : 1.04);
    this.lifespan = decodeLifespan(genes) * (male ? 0.97 : 1.05);
    this.energy = this.maxEnergy * 0.55;
  }

  get stage(): LifeStage {
    const t = this.age / this.lifespan;
    if (t < INFANT_UNTIL) return 'infant';
    if (t < JUVENILE_UNTIL) return 'juvenile';
    if (t < ELDER_FROM) return 'adult';
    return 'elder';
  }

  /** Current body radius: grows from 45% to 100% of adult size. */
  get radius(): number {
    const grown = clamp01(this.age / (this.lifespan * GROWN_AT));
    return this.adultRadius * lerp(0.45, 1, grown);
  }

  get isAdult(): boolean {
    const t = this.age / this.lifespan;
    return t >= JUVENILE_UNTIL;
  }

  /**
   * Activity level given day phase: diurnal creatures slow at night,
   * nocturnal ones at day. Never fully asleep.
   */
  activity(lightLevel: number): number {
    const preference = lerp(lightLevel, 1 - lightLevel, this.genes.nocturnal);
    return 0.35 + 0.65 * preference;
  }

  effectiveVision(lightLevel: number): number {
    // Night-adapted eyes see in the dark; day creatures are nearly blind at night.
    const nightSight = lerp(lightLevel * 0.85 + 0.15, 1, this.genes.nocturnal);
    return this.vision * clamp(nightSight, 0.25, 1);
  }

  canReproduce(): boolean {
    return (
      this.isAdult &&
      this.reproCooldown <= 0 &&
      this.energy >= this.maxEnergy * (0.4 + this.genes.reproThreshold * 0.55)
    );
  }

  /**
   * One simulation step. Perception and steering use the provided grids;
   * the caller handles reproduction matching and death cleanup.
   */
  update(
    dt: number,
    world: World,
    creatureGrid: SpatialGrid<Creature>,
    foodGrid: SpatialGrid<Food>,
    lightLevel: number,
    eaten: (food: Food, bite: number) => void,
    attack: (prey: Creature, damage: number) => void,
  ): void {
    this.age += dt;
    if (this.age >= this.lifespan) {
      this.dead = true;
      this.deathCause = 'age';
      return;
    }
    if (this.reproCooldown > 0) this.reproCooldown -= dt;

    const activity = this.activity(lightLevel);
    const vision = this.effectiveVision(lightLevel);
    const diet = this.genes.diet;
    const hungry = this.energy < this.maxEnergy * 0.85;

    // ---- Perception ----
    let nearestFood: Food | null = null;
    let nearestFoodD2 = Infinity;
    if (hungry && diet < 0.85) {
      foodGrid.query(this.x, this.y, vision, (f, d2) => {
        if (d2 < nearestFoodD2) {
          nearestFoodD2 = d2;
          nearestFood = f;
        }
      });
    }

    let threat: Creature | null = null;
    let threatD2 = Infinity;
    let prey: Creature | null = null;
    let preyD2 = Infinity;
    let mate: Creature | null = null;
    let mateD2 = Infinity;
    const wantsMate = this.canReproduce();
    const wantsPrey = hungry && diet > 0.35;

    creatureGrid.query(this.x, this.y, vision, (other, d2) => {
      if (other === this || other.dead) return;
      // Threat: bigger, meaningfully carnivorous, and close.
      if (
        other.genes.diet > 0.45 &&
        other.radius > this.radius * 1.15 &&
        d2 < threatD2
      ) {
        threatD2 = d2;
        threat = other;
      }
      // Prey: smaller creature, if we're carnivorous enough.
      if (wantsPrey && other.radius < this.radius * 0.85 && d2 < preyD2) {
        preyD2 = d2;
        prey = other;
      }
      // Mate: similar genome, both ready.
      if (
        wantsMate &&
        other.canReproduce() &&
        d2 < mateD2 &&
        Math.abs(other.genes.diet - diet) < 0.35
      ) {
        mateD2 = d2;
        mate = other;
      }
    });

    // ---- Steering: pick a desired direction by priority ----
    let dirX = 0;
    let dirY = 0;
    let urgency = 0.55;

    if (threat !== null && threatD2 < vision * vision * 0.45) {
      const t = threat as Creature;
      dirX = this.x - t.x;
      dirY = this.y - t.y;
      urgency = 1;
    } else if (prey !== null && (nearestFood === null || diet > 0.6)) {
      const p = prey as Creature;
      dirX = p.x - this.x;
      dirY = p.y - this.y;
      urgency = 0.95;
      // Close enough to bite.
      const reach = this.radius + p.radius + 2;
      if (preyD2 < reach * reach) {
        attack(p, (10 + this.radius * 4) * dt * 8);
      }
    } else if (nearestFood !== null && hungry) {
      const f = nearestFood as Food;
      dirX = f.x - this.x;
      dirY = f.y - this.y;
      urgency = 0.85;
      const reach = this.radius + 4;
      if (nearestFoodD2 < reach * reach) {
        eaten(f, dt * 2.2);
      }
    } else if (mate !== null) {
      const m = mate as Creature;
      dirX = m.x - this.x;
      dirY = m.y - this.y;
      urgency = 0.7;
    } else if (this.cultureGoal !== null) {
      // Civilization pull: head toward settlement / shrine / frontier.
      dirX = this.cultureGoal.x - this.x;
      dirY = this.cultureGoal.y - this.y;
      const gd2 = dirX * dirX + dirY * dirY;
      // Arrived: mill about so groups cluster instead of stacking.
      if (gd2 < 18 * 18) {
        this.wanderAngle += rand(-3, 3) * dt;
        dirX = Math.cos(this.wanderAngle);
        dirY = Math.sin(this.wanderAngle);
        urgency = 0.3;
      } else {
        urgency = 0.6;
      }
    } else {
      // Wander: slowly drifting heading.
      this.wanderAngle += rand(-2.4, 2.4) * dt;
      dirX = Math.cos(this.wanderAngle);
      dirY = Math.sin(this.wanderAngle);
      urgency = 0.45;
    }

    // Normalize direction.
    const mag = Math.hypot(dirX, dirY);
    if (mag > 1e-5) {
      dirX /= mag;
      dirY /= mag;
    }

    // Avoid water/world edge/hazards: probe ahead, steer along a deflected angle.
    const probe = 14 + this.radius;
    const aheadX = this.x + dirX * probe;
    const aheadY = this.y + dirY * probe;
    const blocked = (px: number, py: number) =>
      !world.isWalkable(px, py) || world.hazardAt(px, py) > 0.35;
    if (blocked(aheadX, aheadY)) {
      const baseAngle = Math.atan2(dirY, dirX);
      let found = false;
      for (const off of [0.6, -0.6, 1.3, -1.3, 2.1, -2.1]) {
        const a = baseAngle + off;
        if (!blocked(this.x + Math.cos(a) * probe, this.y + Math.sin(a) * probe)) {
          dirX = Math.cos(a);
          dirY = Math.sin(a);
          this.wanderAngle = a;
          found = true;
          break;
        }
      }
      if (!found) {
        dirX = -dirX;
        dirY = -dirY;
        this.wanderAngle += Math.PI;
      }
    }

    // ---- Movement & energy ----
    const biome = world.paramsAt(this.x, this.y);
    const speed = this.maxSpeed * activity * urgency * (this.stage === 'elder' ? 0.7 : 1);
    // Smooth velocity toward target (gives organic motion).
    const accel = 4.5;
    this.vx = lerp(this.vx, dirX * speed, clamp01(accel * dt));
    this.vy = lerp(this.vy, dirY * speed, clamp01(accel * dt));

    let nx = this.x + this.vx * dt;
    let ny = this.y + this.vy * dt;
    if (!world.isWalkable(nx, ny)) {
      // Try axis-separated movement, else stop.
      if (world.isWalkable(nx, this.y)) {
        ny = this.y;
        this.vy *= -0.5;
      } else if (world.isWalkable(this.x, ny)) {
        nx = this.x;
        this.vx *= -0.5;
      } else {
        nx = this.x;
        ny = this.y;
        this.vx *= -0.4;
        this.vy *= -0.4;
      }
    }
    this.x = nx;
    this.y = ny;
    if (Math.hypot(this.vx, this.vy) > 4) {
      this.heading = Math.atan2(this.vy, this.vx);
    }

    // Trail history (only kept when moving fast enough to leave one).
    this.trailTimer -= dt;
    if (this.trailTimer <= 0) {
      this.trailTimer = 0.07;
      if (Math.hypot(this.vx, this.vy) > this.maxSpeed * 0.45) {
        this.trail.push(this.x, this.y);
        if (this.trail.length > 18) this.trail.splice(0, 2);
      } else if (this.trail.length > 0) {
        this.trail.splice(0, 2);
      }
    }

    // Energy drain: basal metabolism + movement cost. Efficiency reduces both.
    const speedNorm = Math.hypot(this.vx, this.vy) / 60;
    const sizeFactor = this.radius / 5;
    const efficiency = 1.25 - this.genes.efficiency * 0.6;
    const cold = world.temperatureAt(this.x, this.y) < 0.15 ? 1.5 : 1;
    const drain =
      (1.15 * sizeFactor + 5.2 * speedNorm * speedNorm * sizeFactor * biome.moveCost) *
      efficiency *
      cold;
    this.energy -= drain * dt;
    if (this.plagued) this.energy -= 4.5 * dt;

    if (this.energy <= 0) {
      this.dead = true;
      this.deathCause = 'starved';
    }
  }

  /** Gain energy from food; herbivore bonus from plant matter. */
  gainFromFood(amount: number): void {
    const plantAffinity = 1 - this.genes.diet * 0.75;
    this.energy = Math.min(this.maxEnergy, this.energy + amount * 30 * plantAffinity);
  }

  /** Gain energy from a kill; carnivore affinity scales the meal. */
  gainFromMeat(preyEnergy: number, preyRadius: number): void {
    const meatAffinity = 0.25 + this.genes.diet * 0.85;
    const meal = (preyEnergy * 0.5 + preyRadius * 8) * meatAffinity;
    this.energy = Math.min(this.maxEnergy, this.energy + meal);
  }
}
