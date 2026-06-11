import {
  DominantSpecies,
  GeneHistogram,
  Genes,
  PopulationPoint,
} from '@/types';
import { averageGenes } from './Genetics';
import { YEAR_SECONDS } from '@/utils/time';
import type { Creature } from './Creature';
import type { SpeciesTracker } from './Species';

const MAX_POINTS = 240;
const HISTOGRAM_GENES: (keyof Genes)[] = [
  'speed',
  'size',
  'vision',
  'diet',
  'efficiency',
  'mutationRate',
  'lifespan',
  'nocturnal',
];

/** Rolling time-series and per-sample aggregates for the dashboard. */
export class StatsCollector {
  popSeries: PopulationPoint[] = [];
  diversitySeries: { t: number; diversity: number }[] = [];
  births = 0;
  deaths = 0;
  generation = 0;

  recordBirth(generation: number): void {
    this.births++;
    if (generation > this.generation) this.generation = generation;
  }

  recordDeath(): void {
    this.deaths++;
  }

  /** Capture one sample point (call ~every 2 sim-seconds). Chart time is years. */
  sample(worldAge: number, creatures: Creature[], tracker: SpeciesTracker): void {
    const years = Math.round(worldAge / YEAR_SECONDS);
    const point: PopulationPoint = { t: years, total: creatures.length };
    // Top species only (keeps recharts payload small).
    const living = tracker.species
      .filter((s) => s.population > 0)
      .sort((a, b) => b.population - a.population)
      .slice(0, 6);
    for (const s of living) point[`s${s.id}`] = s.population;
    this.popSeries.push(point);
    if (this.popSeries.length > MAX_POINTS) this.popSeries.shift();

    this.diversitySeries.push({
      t: years,
      diversity: Number(tracker.diversity(creatures.length).toFixed(3)),
    });
    if (this.diversitySeries.length > MAX_POINTS) this.diversitySeries.shift();
  }

  histograms(creatures: Creature[]): GeneHistogram[] {
    return HISTOGRAM_GENES.map((gene) => {
      const buckets = new Array(10).fill(0);
      for (const c of creatures) {
        const b = Math.min(9, Math.floor(c.genes[gene] * 10));
        buckets[b]++;
      }
      return { gene, buckets };
    });
  }

  dominant(creatures: Creature[], tracker: SpeciesTracker): DominantSpecies | null {
    let best = null as DominantSpecies | null;
    let bestPop = 0;
    for (const s of tracker.species) {
      if (s.population > bestPop) {
        bestPop = s.population;
        best = { id: s.id, color: s.color, population: s.population, avgGenes: s.centroid };
      }
    }
    if (!best) return null;
    // Average over actual members for accuracy (centroid may lag).
    const members = creatures.filter((c) => c.speciesId === best!.id).slice(0, 80);
    if (members.length > 0) best.avgGenes = averageGenes(members.map((m) => m.genes));
    return best;
  }
}
