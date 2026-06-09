import { Genes, SpeciesInfo } from '@/types';
import { hsl } from '@/utils/colors';
import { averageGenes, geneDistance } from './Genetics';
import type { Creature } from './Creature';

/** Genetic distance beyond which an offspring founds a new species. */
const SPECIATION_THRESHOLD = 0.16;
/** How quickly the centroid tracks its population (per assignment). */
const CENTROID_DRIFT = 0.02;

export interface SpeciationEvent {
  t: number;
  generation: number;
  childId: number;
  parentId: number;
}

/**
 * Online species clustering: every creature is assigned to the nearest
 * species centroid; if none is within the speciation threshold, a new
 * species is founded. Centroids drift slowly toward their members so a
 * gradually evolving population stays one species, while a rapid split
 * (geographic isolation, post-catastrophe bottleneck) forks the tree.
 */
export class SpeciesTracker {
  species: SpeciesInfo[] = [];
  events: SpeciationEvent[] = [];
  private nextId = 0;

  speciesColor(id: number): string {
    const s = this.species[id];
    return s ? s.color : '#888';
  }

  /** Assign a creature to a species (used at birth and seeding). */
  assign(creature: Creature, worldAge: number, generation: number): void {
    let best = -1;
    let bestD = Infinity;
    for (const s of this.species) {
      if (s.extinct) continue;
      const d = geneDistance(creature.genes, s.centroid);
      if (d < bestD) {
        bestD = d;
        best = s.id;
      }
    }

    if (best >= 0 && bestD < SPECIATION_THRESHOLD) {
      creature.speciesId = best;
      const s = this.species[best];
      // Drift centroid toward member.
      const c = s.centroid;
      const g = creature.genes;
      c.speed += (g.speed - c.speed) * CENTROID_DRIFT;
      c.size += (g.size - c.size) * CENTROID_DRIFT;
      c.vision += (g.vision - c.vision) * CENTROID_DRIFT;
      c.diet += (g.diet - c.diet) * CENTROID_DRIFT;
      c.efficiency += (g.efficiency - c.efficiency) * CENTROID_DRIFT;
      c.reproThreshold += (g.reproThreshold - c.reproThreshold) * CENTROID_DRIFT;
      c.mutationRate += (g.mutationRate - c.mutationRate) * CENTROID_DRIFT;
      c.lifespan += (g.lifespan - c.lifespan) * CENTROID_DRIFT;
      c.nocturnal += (g.nocturnal - c.nocturnal) * CENTROID_DRIFT;
      let dh = g.hue - c.hue;
      if (dh > 0.5) dh -= 1;
      if (dh < -0.5) dh += 1;
      c.hue = (c.hue + dh * CENTROID_DRIFT + 1) % 1;
      return;
    }

    // Found a new species.
    const id = this.nextId++;
    const parentId = best;
    const info: SpeciesInfo = {
      id,
      centroid: { ...creature.genes },
      color: this.colorFor(creature.genes, id),
      bornGeneration: generation,
      bornAt: worldAge,
      parentId,
      population: 0,
      extinct: false,
    };
    this.species.push(info);
    creature.speciesId = id;
    if (parentId >= 0) {
      this.events.push({ t: worldAge, generation, childId: id, parentId });
      if (this.events.length > 60) this.events.shift();
    }
  }

  private colorFor(g: Genes, id: number): string {
    // Hue from genes, nudged per species id so close species stay tellable.
    const hue = (g.hue * 360 + id * 23) % 360;
    return hsl(hue, 0.72, 0.62);
  }

  /** Recompute populations & extinction flags from the live population. */
  refresh(creatures: Creature[]): void {
    for (const s of this.species) s.population = 0;
    const genesById = new Map<number, Genes[]>();
    for (const c of creatures) {
      const s = this.species[c.speciesId];
      if (!s) continue;
      s.population++;
      let arr = genesById.get(s.id);
      if (!arr) {
        arr = [];
        genesById.set(s.id, arr);
      }
      if (arr.length < 64) arr.push(c.genes);
    }
    for (const s of this.species) {
      if (s.population === 0 && !s.extinct) s.extinct = true;
      const sample = genesById.get(s.id);
      if (sample && sample.length >= 4) {
        // Periodic re-centering keeps centroid honest.
        const avg = averageGenes(sample);
        s.centroid = avg;
      }
    }
  }

  /** Shannon diversity index across living species. */
  diversity(total: number): number {
    if (total === 0) return 0;
    let h = 0;
    for (const s of this.species) {
      if (s.population === 0) continue;
      const p = s.population / total;
      h -= p * Math.log(p);
    }
    return h;
  }
}
