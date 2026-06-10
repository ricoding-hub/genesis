import {
  CivMilestone,
  Era,
  ERA_ICONS,
  ERA_NAMES,
  Structure,
  TribeInfo,
} from '@/types';
import { hsl } from '@/utils/colors';
import { clamp01, dist2, pick, rand, TAU } from '@/utils/math';
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

let nextTribeId = 0;
let nextStructureId = 1;

interface Tribe {
  id: number;
  name: string;
  deity: string | null;
  color: string;
  knowledge: number;
  era: Era;
  settlement: { x: number; y: number };
  founded: number;
  population: number;
  explorers: number;
  /** Learning effort accumulated this tick (applied with saturation). */
  effort: number;
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

  private log(icon: string, text: string, worldAge: number): void {
    this.milestones.unshift({ t: Math.round(worldAge), icon, text });
    if (this.milestones.length > 80) this.milestones.pop();
  }

  private newTribe(x: number, y: number, worldAge: number): Tribe {
    const id = nextTribeId++;
    const name = `The ${pick(TRIBE_PREFIX)}${pick(TRIBE_SUFFIX)}`;
    const tribe: Tribe = {
      id,
      name,
      deity: null,
      color: hsl(rand(0, 360), 0.55, 0.62),
      knowledge: 0,
      era: Era.Stone,
      settlement: { x, y },
      founded: worldAge,
      population: 0,
      explorers: 0,
      effort: 0,
      fireTimer: 0,
      farmTimer: 0,
      hasShrine: false,
    };
    this.tribes.set(id, tribe);
    this.eraOf.set(id, Era.Stone);
    this.log('✨', `${name} awakens — the Spark of Sapience`, worldAge);
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
    for (const t of this.tribes.values()) t.effort = 0;
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
    }

    // Convert effort → knowledge with diminishing returns on headcount and a
    // slowdown in later ages (each leap is harder than the last).
    for (const tribe of this.tribes.values()) {
      if (tribe.population < 1) continue;
      const saturation = tribe.effort / (1 + tribe.population * 0.12);
      const eraSlow = 1 / (1 + tribe.era * 0.55);
      tribe.knowledge += saturation * 0.06 * eraSlow * dt;
    }

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
        this.log('🔥', `${tribe.name} discovered Fire`, worldAge);
        this.addStructure('campfire', tribe);
        break;
      case Era.Tools:
        this.log('🪓', `${tribe.name} forged the first Tools`, worldAge);
        break;
      case Era.Agriculture:
        this.log('🌾', `${tribe.name} learned to farm the land`, worldAge);
        break;
      case Era.Faith: {
        tribe.deity = `${pick(DEITY_A)}${pick(DEITY_B)}`;
        tribe.hasShrine = true;
        this.addStructure('shrine', tribe);
        this.log('⛩️', `${tribe.name} raised a shrine to ${tribe.deity}`, worldAge);
        break;
      }
      case Era.Writing:
        this.log('📜', `${tribe.name} invented writing — ${ERA_NAMES[era]}`, worldAge);
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
        this.log('🪦', `${tribe.name} faded into legend`, worldAge);
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
