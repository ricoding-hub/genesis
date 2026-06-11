import { CivMilestone, Era, ERA_ICONS, Structure, TribeInfo } from '@/types';
import { hsl } from '@/utils/colors';
import { clamp, clamp01, dist2, pick, rand, TAU } from '@/utils/math';
import type { Creature } from './Creature';
import type { SpatialGrid } from './SpatialGrid';
import { WORLD_H, WORLD_W } from './World';
import type { World } from './World';

/**
 * Knowledge required to *enter* each era (cumulative). Tuned together with
 * the saturating gain in update() so a healthy tribe takes ~1 min to tame
 * Fire and many minutes to reach Writing — the arc is meant to be watched.
 */
const ERA_THRESHOLDS: Record<Era, number> = {
  [Era.Stone]: 0,
  [Era.Fire]: 22,
  [Era.Tools]: 70,
  [Era.Agriculture]: 160,
  [Era.Faith]: 300,
  [Era.Writing]: 520,
};

/** A tribe needs this many living members to keep existing. */
const MIN_TRIBE = 2;
/** Humanoids alive of one species before the Spark of Sapience fires. */
const SPARK_POPULATION = 6;
const CAMPFIRE_RADIUS = 95;
const SHRINE_RADIUS = 70;

const TRIBE_PREFIX = [
  'Ember',
  'Stone',
  'Dawn',
  'Sun',
  'Moon',
  'River',
  'Ash',
  'Iron',
  'Wind',
  'Frost',
  'Thorn',
  'Star',
];
const TRIBE_SUFFIX = ['kin', 'born', 'folk', 'ward', 'wood', 'clan', 'song', 'hold'];
const DEITY_A = ['Au', 'So', 'Ve', 'Kor', 'Lu', 'Ny', 'Ra', 'Xa', 'Mor', 'Sel'];
const DEITY_B = ['rel', 'luna', 'thys', 'ros', 'mira', 'gantu', 'dor', 'wyn', 'eth', 'ka'];

/**
 * Personal name pools by cultural tier. Stone-age folk grunt monosyllables;
 * as knowledge grows, names get longer and softer. Female endings flavor
 * the final syllable.
 */
const NAME_STONE = ['Ug', 'Bok', 'Gra', 'Mok', 'Tur', 'Zug', 'Kra', 'Dun', 'Gor', 'Hax'];
const NAME_MID_A = ['Ka', 'Bo', 'Tu', 'Ra', 'Mi', 'Da', 'Lo', 'Su', 'Ne', 'Va'];
const NAME_MID_B = ['ran', 'mok', 'tar', 'lin', 'dor', 'gar', 'vek', 'nul', 'rim', 'bas'];
const NAME_HIGH_A = ['Ael', 'Cor', 'Ser', 'Tal', 'Mir', 'Or', 'Lys', 'Ver', 'Nal', 'El'];
const NAME_HIGH_B = ['ian', 'andro', 'ethe', 'ione', 'avel', 'oren', 'isse', 'ara', 'emir', 'ude'];

/** Generate an era-appropriate personal name. */
function eraName(era: Era, sex: 'M' | 'F'): string {
  let base: string;
  if (era <= Era.Fire) {
    base = pick(NAME_STONE);
  } else if (era <= Era.Agriculture) {
    base = pick(NAME_MID_A) + pick(NAME_MID_B);
  } else {
    base = pick(NAME_HIGH_A) + pick(NAME_HIGH_B);
  }
  if (sex === 'F') {
    // Feminine flavor: soften the ending.
    if (/[bkdgrxz]$/i.test(base)) base += 'a';
    else if (base.endsWith('o')) base = base.slice(0, -1) + 'a';
    else if (!/[aei]$/i.test(base)) base += 'i';
  }
  return base;
}

/** Variant of a sacred name for a new believer ("Ricardo II", "Ricarda"…). */
function sacredVariant(sacred: string, sex: 'M' | 'F'): string {
  let base = sacred;
  if (sex === 'F') {
    if (base.endsWith('o')) base = base.slice(0, -1) + 'a';
    else if (!/[a]$/i.test(base)) base += 'a';
  }
  const r = Math.random();
  if (r < 0.5) return base;
  if (r < 0.75) return `${base} II`;
  if (r < 0.9) return `${base} III`;
  return `${base} el Joven`;
}

let nextTribeId = 0;
let nextStructureId = 1;

interface Tribe {
  id: number;
  name: string;
  deity: string | null;
  /** Name received from the player-god's "bible"; believers adopt it. */
  sacredName: string | null;
  color: string;
  knowledge: number;
  era: Era;
  settlement: { x: number; y: number };
  founded: number;
  population: number;
  explorers: number;
  /** Learning effort accumulated this tick (applied with saturation). */
  effort: number;
  /** Sum of (vision+efficiency) over members this tick → average intellect. */
  intelSum: number;
  /** Divine favor toward the player-god, 0..100. */
  favor: number;
  hasTemple: boolean;
  templeTimer: number;
  sacrificeTimer: number;
  /** Cooldown timers for structure building. */
  fireTimer: number;
  farmTimer: number;
  hasShrine: boolean;
}

/**
 * The civilization layer. Humanoid creatures form tribes that accumulate
 * collective knowledge through communication, elders and explorers, advance
 * through technological eras, and erect structures (campfires, shrines,
 * farms) that feed back into survival. Everything here runs only over the
 * humanoid subset, so it stays cheap.
 */
export class Culture {
  tribes = new Map<number, Tribe>();
  structures: Structure[] = [];
  milestones: CivMilestone[] = [];
  /** Tribe id → era, for the renderer's fast per-creature sprite lookup. */
  eraOf = new Map<number, Era>();

  private sparked = false;
  private worshipClock = 0;

  /** Look up a tribe's current era (Stone for unknown/lone humanoids). */
  tribeEra(tribeId: number): Era {
    return this.eraOf.get(tribeId) ?? Era.Stone;
  }

  tribe(tribeId: number): Tribe | undefined {
    return this.tribes.get(tribeId);
  }

  private log(icon: string, key: string, params: Record<string, string | number>, worldAge: number): void {
    this.milestones.unshift({ t: Math.round(worldAge), icon, key, params });
    if (this.milestones.length > 80) this.milestones.pop();
  }

  private newTribe(x: number, y: number, worldAge: number): Tribe {
    const id = nextTribeId++;
    const name = `${pick(TRIBE_PREFIX)}${pick(TRIBE_SUFFIX)}`;
    const tribe: Tribe = {
      id,
      name,
      deity: null,
      sacredName: null,
      color: hsl(rand(0, 360), 0.55, 0.62),
      knowledge: 0,
      era: Era.Stone,
      settlement: { x, y },
      founded: worldAge,
      population: 0,
      explorers: 0,
      effort: 0,
      intelSum: 0,
      favor: 40,
      hasTemple: false,
      templeTimer: 0,
      sacrificeTimer: 0,
      fireTimer: 0,
      farmTimer: 0,
      hasShrine: false,
    };
    this.tribes.set(id, tribe);
    this.eraOf.set(id, Era.Stone);
    this.log('✨', 'spark', { tribe: name }, worldAge);
    return tribe;
  }

  /** God tool: instantly found a tribe of humanoids at a point. */
  foundTribeAt(x: number, y: number, members: Creature[], worldAge: number): void {
    const tribe = this.newTribe(x, y, worldAge);
    members.forEach((c, i) => {
      c.tribeId = tribe.id;
      c.explorer = i === 0; // at least one pioneer
    });
  }

  private eraFor(knowledge: number): Era {
    let era = Era.Stone;
    for (const e of [Era.Fire, Era.Tools, Era.Agriculture, Era.Faith, Era.Writing]) {
      if (knowledge >= ERA_THRESHOLDS[e]) era = e;
    }
    return era;
  }

  /**
   * Main per-tick update. `humanoids` is the live humanoid subset; the grid
   * is the shared creature grid for neighbour queries.
   */
  update(
    dt: number,
    humanoids: Creature[],
    grid: SpatialGrid<Creature>,
    world: World,
    worldAge: number,
  ): void {
    // Reset per-tick tallies.
    for (const t of this.tribes.values()) {
      t.population = 0;
      t.explorers = 0;
    }

    // Spark of Sapience: first sizeable humanoid group auto-founds a tribe.
    if (!this.sparked) {
      const free = humanoids.filter((c) => c.tribeId < 0);
      if (free.length >= SPARK_POPULATION) {
        let cx = 0;
        let cy = 0;
        for (const c of free) {
          cx += c.x;
          cy += c.y;
        }
        const tribe = this.newTribe(cx / free.length, cy / free.length, worldAge);
        this.sparked = true;
        for (const c of free) {
          c.tribeId = tribe.id;
          c.explorer = c.genes.vision > 0.6 && c.genes.speed > 0.55 && Math.random() < 0.5;
        }
      }
    }

    // Assign tribe to lone humanoids by adopting the nearest tribe member,
    // else (rarely) found a splinter tribe.
    for (const c of humanoids) {
      if (c.tribeId >= 0 && this.tribes.has(c.tribeId)) continue;
      let adopted = -1;
      grid.query(c.x, c.y, 140, (other) => {
        if (other === c || other.tribeId < 0) return;
        if (!this.tribes.has(other.tribeId)) return;
        adopted = other.tribeId;
        return true;
      });
      if (adopted >= 0) {
        c.tribeId = adopted;
        c.explorer = c.genes.vision > 0.62 && Math.random() < 0.2;
      } else if (this.sparked && Math.random() < 0.004) {
        const t = this.newTribe(c.x, c.y, worldAge);
        c.tribeId = t.id;
      }
    }

    // Per-creature learning effort + culture steering. Effort is summed per
    // tribe and converted to knowledge below with population saturation, so a
    // 200-strong tribe doesn't learn 40x faster than a band of five.
    for (const t of this.tribes.values()) {
      t.effort = 0;
      t.intelSum = 0;
    }
    this.worshipClock += dt;
    const worshipPhase = (this.worshipClock % 30) < 6; // brief gathering window
    for (const c of humanoids) {
      const tribe = this.tribes.get(c.tribeId);
      if (!tribe) {
        c.cultureGoal = null;
        continue;
      }
      tribe.population++;
      if (c.explorer) tribe.explorers++;
      // Every tribe member carries a name fitting their culture.
      if (!c.name) c.name = this.nameFor(tribe.id, c.sex);

      // Communication: more nearby kin → faster collective learning.
      let kin = 0;
      grid.query(c.x, c.y, 70, (other) => {
        if (other !== c && other.tribeId === c.tribeId) kin++;
      });
      const elderBonus = c.age / c.lifespan > 0.6 ? 1.6 : 1;
      let effort = (0.4 + 0.5 * Math.min(kin, 6)) * elderBonus;

      // Explorers learn by venturing; others orbit the settlement / shrine.
      c.worshipping = false;
      if (c.explorer) {
        const d2 = dist2(c.x, c.y, tribe.settlement.x, tribe.settlement.y);
        if (!c.cultureGoal || d2 < 120 * 120 || Math.random() < 0.004) {
          c.cultureGoal = this.frontierGoal(tribe, world);
        }
        effort += 0.6; // curiosity dividend
        // Discovery: reaching a far frontier tile rewards the whole tribe.
        if (c.cultureGoal && dist2(c.x, c.y, c.cultureGoal.x, c.cultureGoal.y) < 30 * 30) {
          tribe.knowledge += 0.8;
          c.cultureGoal = this.frontierGoal(tribe, world);
        }
      } else if (tribe.hasShrine && worshipPhase) {
        // Gather at the shrine to worship.
        const shrine = this.structures.find(
          (s) => s.type === 'shrine' && s.tribeId === tribe.id,
        );
        if (shrine) {
          c.cultureGoal = { x: shrine.x, y: shrine.y };
          if (dist2(c.x, c.y, shrine.x, shrine.y) < 40 * 40) {
            c.worshipping = true;
            effort += 1.2;
            c.energy = Math.min(c.maxEnergy, c.energy + 4 * dt); // faith sustains
          }
        }
      } else {
        // Drift home toward the settlement.
        if (!c.cultureGoal || Math.random() < 0.01) {
          c.cultureGoal = {
            x: tribe.settlement.x + rand(-60, 60),
            y: tribe.settlement.y + rand(-60, 60),
          };
        }
      }
      tribe.effort += effort;
      tribe.intelSum += c.genes.vision + c.genes.efficiency;
    }

    // Convert effort → knowledge with diminishing returns on headcount, a
    // slowdown in later ages, and a boost for smarter tribes (so "smart"
    // cohorts out-tech "strong" ones).
    for (const tribe of this.tribes.values()) {
      if (tribe.population < 1) continue;
      const saturation = tribe.effort / (1 + tribe.population * 0.12);
      const eraSlow = 1 / (1 + tribe.era * 0.55);
      const intellect = tribe.intelSum / tribe.population; // 0..2
      const intelFactor = 0.55 + intellect * 0.5; // ~0.55..1.55
      tribe.knowledge += saturation * 0.06 * eraSlow * intelFactor * dt;
    }

    // Divine favor relaxes toward neutral; temples & sacrifices managed here.
    this.updateDivine(dt, humanoids, worldAge);

    // Slowly recentre each settlement on its living members.
    this.recentreSettlements(humanoids);

    // Advance eras, build structures, run economy.
    for (const tribe of this.tribes.values()) {
      if (tribe.population < MIN_TRIBE) continue;
      this.advanceEra(tribe, worldAge);
      this.buildAndFarm(tribe, dt, world);
    }

    // Knowledge diffusion between tribes whose members mingle.
    this.diffuse(humanoids, grid);

    // Retire extinct tribes; age structures.
    this.cull(worldAge);
    for (const s of this.structures) s.phase += dt;
  }

  private frontierGoal(tribe: Tribe, world: World): { x: number; y: number } {
    let best = { x: tribe.settlement.x, y: tribe.settlement.y };
    let bestScore = -Infinity;
    for (let i = 0; i < 6; i++) {
      const a = rand(0, TAU);
      const d = rand(200, 520);
      const x = clamp01((tribe.settlement.x + Math.cos(a) * d) / WORLD_W) * WORLD_W;
      const y = clamp01((tribe.settlement.y + Math.sin(a) * d) / WORLD_H) * WORLD_H;
      if (!world.isWalkable(x, y)) continue;
      const score = dist2(x, y, tribe.settlement.x, tribe.settlement.y) * rand(0.5, 1);
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
    return best;
  }

  private recentreSettlements(humanoids: Creature[]): void {
    const acc = new Map<number, { x: number; y: number; n: number }>();
    for (const c of humanoids) {
      if (c.tribeId < 0 || c.explorer) continue;
      let a = acc.get(c.tribeId);
      if (!a) {
        a = { x: 0, y: 0, n: 0 };
        acc.set(c.tribeId, a);
      }
      a.x += c.x;
      a.y += c.y;
      a.n++;
    }
    for (const [id, a] of acc) {
      const tribe = this.tribes.get(id);
      if (!tribe || a.n === 0) continue;
      tribe.settlement.x += (a.x / a.n - tribe.settlement.x) * 0.02;
      tribe.settlement.y += (a.y / a.n - tribe.settlement.y) * 0.02;
    }
  }

  private advanceEra(tribe: Tribe, worldAge: number): void {
    const era = this.eraFor(tribe.knowledge);
    if (era <= tribe.era) return;
    // May jump multiple eras in one tick at very high knowledge — log each.
    for (let e = tribe.era + 1; e <= era; e++) {
      tribe.era = e as Era;
      this.eraOf.set(tribe.id, tribe.era);
      this.onEnterEra(tribe, e as Era, worldAge);
    }
  }

  private onEnterEra(tribe: Tribe, era: Era, worldAge: number): void {
    switch (era) {
      case Era.Fire:
        this.log('🔥', 'fire', { tribe: tribe.name }, worldAge);
        this.addStructure('campfire', tribe);
        break;
      case Era.Tools:
        this.log('🪓', 'tools', { tribe: tribe.name }, worldAge);
        break;
      case Era.Agriculture:
        this.log('🌾', 'agriculture', { tribe: tribe.name }, worldAge);
        break;
      case Era.Faith: {
        tribe.deity = `${pick(DEITY_A)}${pick(DEITY_B)}`;
        tribe.hasShrine = true;
        this.addStructure('shrine', tribe);
        this.log('⛩️', 'faith', { tribe: tribe.name, deity: tribe.deity }, worldAge);
        break;
      }
      case Era.Writing:
        this.log('📜', 'writing', { tribe: tribe.name }, worldAge);
        break;
      default:
        break;
    }
  }

  private addStructure(type: Structure['type'], tribe: Tribe, dx = 0, dy = 0): void {
    this.structures.push({
      id: nextStructureId++,
      type,
      x: tribe.settlement.x + dx,
      y: tribe.settlement.y + dy,
      tribeId: tribe.id,
      phase: 0,
    });
  }

  private buildAndFarm(tribe: Tribe, dt: number, world: World): void {
    // Fire era: keep a couple of campfires going around the settlement.
    if (tribe.era >= Era.Fire) {
      tribe.fireTimer -= dt;
      if (tribe.fireTimer <= 0) {
        tribe.fireTimer = 14;
        const fires = this.structures.filter(
          (s) => s.type === 'campfire' && s.tribeId === tribe.id,
        );
        if (fires.length < 2) {
          this.addStructure('campfire', tribe, rand(-40, 40), rand(-40, 40));
        }
      }
    }
    // Agriculture: cultivate food near farm plots.
    if (tribe.era >= Era.Agriculture) {
      tribe.farmTimer -= dt;
      if (tribe.farmTimer <= 0) {
        tribe.farmTimer = 2.5;
        let farms = this.structures.filter(
          (s) => s.type === 'farm' && s.tribeId === tribe.id,
        );
        if (farms.length < 3) {
          const fx = tribe.settlement.x + rand(-70, 70);
          const fy = tribe.settlement.y + rand(-70, 70);
          if (world.isWalkable(fx, fy)) {
            this.structures.push({
              id: nextStructureId++,
              type: 'farm',
              x: fx,
              y: fy,
              tribeId: tribe.id,
              phase: 0,
            });
            farms = this.structures.filter(
              (s) => s.type === 'farm' && s.tribeId === tribe.id,
            );
          }
        }
        for (const farm of farms) {
          world.spawnFoodCluster(farm.x, farm.y, 4, 26);
        }
      }
    }
  }

  private diffuse(humanoids: Creature[], grid: SpatialGrid<Creature>): void {
    for (const c of humanoids) {
      if (c.tribeId < 0) continue;
      const mine = this.tribes.get(c.tribeId);
      if (!mine) continue;
      grid.query(c.x, c.y, 60, (other) => {
        if (other.tribeId < 0 || other.tribeId === c.tribeId) return;
        const theirs = this.tribes.get(other.tribeId);
        if (theirs && theirs.knowledge > mine.knowledge) {
          // Ideas cross tribal lines, slowly.
          mine.knowledge += (theirs.knowledge - mine.knowledge) * 0.0006;
        }
      });
    }
  }

  private cull(worldAge: number): void {
    for (const [id, tribe] of this.tribes) {
      if (tribe.population === 0 && worldAge - tribe.founded > 4) {
        this.log('🪦', 'faded', { tribe: tribe.name }, worldAge);
        this.tribes.delete(id);
        this.eraOf.delete(id);
        this.structures = this.structures.filter((s) => s.tribeId !== id);
      }
    }
  }

  // ---- Mechanics queried by Simulation ----

  /** Warmth: fraction (0..1) of cold mitigation from a nearby campfire. */
  warmthAt(x: number, y: number): number {
    let best = 0;
    for (const s of this.structures) {
      if (s.type !== 'campfire') continue;
      const d2 = dist2(x, y, s.x, s.y);
      if (d2 < CAMPFIRE_RADIUS * CAMPFIRE_RADIUS) {
        best = Math.max(best, 1 - Math.sqrt(d2) / CAMPFIRE_RADIUS);
      }
    }
    return best;
  }

  /** Cooking multiplier (>1) when eating beside a campfire. */
  cookingBonusAt(x: number, y: number): number {
    return this.warmthAt(x, y) > 0.1 ? 1.7 : 1;
  }

  /** Tool-era foraging/hunting multiplier for a humanoid. */
  toolBonus(tribeId: number): number {
    const era = this.eraOf.get(tribeId);
    return era !== undefined && era >= Era.Tools ? 1.5 : 1;
  }

  // ---- Divine interaction (the player is their god) ----

  /** Find the tribe whose settlement is nearest a point (for divine acts). */
  nearestTribeId(x: number, y: number, maxDist = 600): number {
    let best = -1;
    let bestD2 = maxDist * maxDist;
    for (const t of this.tribes.values()) {
      const d2 = dist2(x, y, t.settlement.x, t.settlement.y);
      if (d2 < bestD2) {
        bestD2 = d2;
        best = t.id;
      }
    }
    return best;
  }

  addFavor(tribeId: number, amount: number): void {
    const t = this.tribes.get(tribeId);
    if (t) t.favor = clamp(t.favor + amount, 0, 100);
  }

  /** Jump a tribe straight to an era (preloaded "Advanced Humans" scenario). */
  forceEra(tribeId: number, era: Era, worldAge: number): void {
    const t = this.tribes.get(tribeId);
    if (!t) return;
    t.knowledge = ERA_THRESHOLDS[era] + 1;
    t.population = Math.max(t.population, MIN_TRIBE);
    this.advanceEra(t, worldAge);
    t.favor = 82; // adore you enough to raise a temple
  }

  /** Era-appropriate personal name; believers may inherit the sacred name. */
  nameFor(tribeId: number, sex: 'M' | 'F'): string {
    const tribe = this.tribes.get(tribeId);
    if (!tribe) return eraName(Era.Stone, sex);
    if (tribe.sacredName && Math.random() < 0.6) {
      return sacredVariant(tribe.sacredName, sex);
    }
    return eraName(tribe.era, sex);
  }

  /**
   * The player-god sends a "bible" bearing a name. The nearest tribe adopts
   * it as sacred: favor rises and new believers are named after it.
   */
  receiveBible(x: number, y: number, name: string, worldAge: number): string | null {
    const id = this.nearestTribeId(x, y);
    if (id < 0) return null;
    const t = this.tribes.get(id)!;
    t.sacredName = name;
    t.favor = clamp(t.favor + 15, 0, 100);
    // Scripture is knowledge: a nudge toward (or deepening of) the faith.
    t.knowledge += 12;
    this.log('📖', 'bible', { tribe: t.name, name }, worldAge);
    return t.name;
  }

  /** A divine blessing was poured on a place — nearby tribes rejoice. */
  onBlessing(x: number, y: number, worldAge: number): string | null {
    const id = this.nearestTribeId(x, y);
    if (id < 0) return null;
    const t = this.tribes.get(id)!;
    t.favor = clamp(t.favor + 18, 0, 100);
    this.log('🌟', 'bless', { tribe: t.name }, worldAge);
    return t.name;
  }

  /** A divine smite struck — nearby tribes fear (favor swings on terror). */
  onSmite(x: number, y: number, worldAge: number): string | null {
    const id = this.nearestTribeId(x, y);
    if (id < 0) return null;
    const t = this.tribes.get(id)!;
    // Terror: mostly fear (favor up via awe) but some resentment.
    t.favor = clamp(t.favor + 6, 0, 100);
    this.log('⚡', 'smite', { tribe: t.name }, worldAge);
    return t.name;
  }

  /** Per-tick divine bookkeeping: favor decay, temples, sacrifices. */
  private updateDivine(dt: number, humanoids: Creature[], worldAge: number): void {
    for (const tribe of this.tribes.values()) {
      if (tribe.population < MIN_TRIBE) continue;
      // Favor relaxes gently toward a neutral 45.
      tribe.favor += (45 - tribe.favor) * 0.01 * dt;
      // Starvation lowers favor (the god is failing them).
      const starving = tribe.population > 0 && this.starvingFraction(tribe, humanoids) > 0.4;
      if (starving) tribe.favor = clamp(tribe.favor - 4 * dt, 0, 100);

      // Temple: high favor + Faith era → build one to the player-god.
      if (!tribe.hasTemple && tribe.era >= Era.Faith && tribe.favor > 70) {
        tribe.templeTimer += dt;
        if (tribe.templeTimer > 4) {
          tribe.hasTemple = true;
          this.addStructure('temple', tribe, rand(-30, 30), rand(-30, 30));
          this.log('🏛️', 'temple', { tribe: tribe.name }, worldAge);
        }
      }

      // Sacrifice: low favor or starving → offer to appease the god.
      if (tribe.era >= Era.Faith && (tribe.favor < 35 || starving)) {
        tribe.sacrificeTimer += dt;
        if (tribe.sacrificeTimer > 12) {
          tribe.sacrificeTimer = 0;
          if (!tribe.hasTemple) this.addStructure('altar', tribe, rand(-24, 24), rand(-24, 24));
          tribe.favor = clamp(tribe.favor + 20, 0, 100);
          this.log('🔪', 'sacrifice', { tribe: tribe.name }, worldAge);
          // The offering: a member gives their life.
          const members = humanoids.filter((c) => c.tribeId === tribe.id && !c.explorer);
          if (members.length > 4) {
            const victim = members[(Math.random() * members.length) | 0];
            victim.dead = true;
            victim.deathCause = 'killed';
          }
        }
      } else {
        tribe.sacrificeTimer = 0;
      }

      // Praying-to-you visual: members near a temple pray skyward.
      if (tribe.hasTemple) {
        const temple = this.structures.find(
          (s) => s.type === 'temple' && s.tribeId === tribe.id,
        );
        if (temple) {
          for (const c of humanoids) {
            if (c.tribeId !== tribe.id || c.explorer) continue;
            c.praying = dist2(c.x, c.y, temple.x, temple.y) < 50 * 50;
          }
        }
      }
    }
  }

  private starvingFraction(tribe: Tribe, humanoids: Creature[]): number {
    let n = 0;
    let hungry = 0;
    for (const c of humanoids) {
      if (c.tribeId !== tribe.id) continue;
      n++;
      if (c.energy < c.maxEnergy * 0.2) hungry++;
    }
    return n === 0 ? 0 : hungry / n;
  }

  // ---- Snapshot for UI ----

  tribeInfos(): TribeInfo[] {
    const out: TribeInfo[] = [];
    for (const t of this.tribes.values()) {
      if (t.population === 0) continue;
      const cur = ERA_THRESHOLDS[t.era];
      const next =
        t.era >= Era.Writing ? cur + 1 : ERA_THRESHOLDS[(t.era + 1) as Era];
      out.push({
        id: t.id,
        name: t.name,
        deity: t.deity,
        color: t.color,
        era: t.era,
        eraProgress: clamp01((t.knowledge - cur) / (next - cur)),
        knowledge: t.knowledge,
        population: t.population,
        explorers: t.explorers,
        founded: t.founded,
        favor: t.favor,
        hasTemple: t.hasTemple,
      });
    }
    return out.sort((a, b) => b.population - a.population);
  }

  /** Most advanced living tribe, for the HUD chip. */
  dominantTribe(): TribeInfo | null {
    const infos = this.tribeInfos();
    if (infos.length === 0) return null;
    return [...infos].sort((a, b) => b.era - a.era || b.population - a.population)[0];
  }

  log_(): CivMilestone[] {
    return this.milestones.slice(0, 40);
  }

  eraIcon(era: Era): string {
    return ERA_ICONS[era];
  }

  shrineRadius(): number {
    return SHRINE_RADIUS;
  }
}
