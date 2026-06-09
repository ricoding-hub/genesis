import { GENE_KEYS, Genes } from '@/types';
import { clamp01, gaussian, rand } from '@/utils/math';

/** Phenotype decode ranges (gene 0..1 → physical value). */
export const PHENO = {
  /** px per second. */
  speed: { min: 14, max: 95 },
  /** body radius px. */
  size: { min: 2.6, max: 9.5 },
  /** vision radius px. */
  vision: { min: 35, max: 160 },
  /** max energy storage. */
  energy: { min: 55, max: 190 },
  /** lifespan in sim-seconds. */
  lifespan: { min: 75, max: 320 },
} as const;

export function decodeSpeed(g: Genes): number {
  return PHENO.speed.min + g.speed * (PHENO.speed.max - PHENO.speed.min);
}
export function decodeSize(g: Genes): number {
  return PHENO.size.min + g.size * (PHENO.size.max - PHENO.size.min);
}
export function decodeVision(g: Genes): number {
  return PHENO.vision.min + g.vision * (PHENO.vision.max - PHENO.vision.min);
}
export function decodeMaxEnergy(g: Genes): number {
  return PHENO.energy.min + g.size * (PHENO.energy.max - PHENO.energy.min);
}
export function decodeLifespan(g: Genes): number {
  return PHENO.lifespan.min + g.lifespan * (PHENO.lifespan.max - PHENO.lifespan.min);
}

export function randomGenes(): Genes {
  return {
    speed: rand(0.25, 0.75),
    size: rand(0.2, 0.7),
    vision: rand(0.25, 0.75),
    hue: Math.random(),
    diet: rand(0, 0.45), // start mostly herbivorous; carnivory must evolve
    efficiency: rand(0.3, 0.7),
    reproThreshold: rand(0.45, 0.75),
    mutationRate: rand(0.15, 0.45),
    lifespan: rand(0.3, 0.7),
    nocturnal: rand(0.1, 0.5),
  };
}

export function cloneGenes(g: Genes): Genes {
  return { ...g };
}

/** Uniform crossover: each gene randomly inherited from either parent. */
export function crossover(a: Genes, b: Genes): Genes {
  const child = {} as Genes;
  for (const k of GENE_KEYS) {
    child[k] = Math.random() < 0.5 ? a[k] : b[k];
  }
  return child;
}

/**
 * Mutate in place. The genome's own mutationRate gene controls both the
 * per-gene probability and perturbation magnitude. Hue wraps around so
 * color drifts circularly.
 */
export function mutate(g: Genes): Genes {
  const rate = 0.04 + g.mutationRate * 0.22;
  const magnitude = 0.03 + g.mutationRate * 0.1;
  for (const k of GENE_KEYS) {
    if (Math.random() < rate) {
      const delta = gaussian() * magnitude;
      if (k === 'hue') {
        g.hue = (g.hue + delta + 1) % 1;
      } else {
        g[k] = clamp01(g[k] + delta);
      }
    }
  }
  return g;
}

/**
 * Normalized genetic distance between genomes, used for mate compatibility
 * and speciation. Hue is circular.
 */
export function geneDistance(a: Genes, b: Genes): number {
  let sum = 0;
  for (const k of GENE_KEYS) {
    let d: number;
    if (k === 'hue') {
      d = Math.abs(a.hue - b.hue);
      if (d > 0.5) d = 1 - d;
      d *= 2;
    } else {
      d = a[k] - b[k];
    }
    sum += d * d;
  }
  return Math.sqrt(sum / GENE_KEYS.length);
}

/** Average a list of genomes (hue averaged on the circle). */
export function averageGenes(list: Genes[]): Genes {
  const avg = {} as Genes;
  for (const k of GENE_KEYS) {
    if (k === 'hue') continue;
    let s = 0;
    for (const g of list) s += g[k];
    avg[k] = s / list.length;
  }
  let sx = 0;
  let sy = 0;
  for (const g of list) {
    sx += Math.cos(g.hue * Math.PI * 2);
    sy += Math.sin(g.hue * Math.PI * 2);
  }
  avg.hue = (Math.atan2(sy, sx) / (Math.PI * 2) + 1) % 1;
  return avg;
}

export interface GenePreset {
  name: string;
  description: string;
  genes: Genes;
}

export const GENE_PRESETS: GenePreset[] = [
  {
    name: 'Speed Demon',
    description: 'Blisteringly fast scavenger. Burns energy like a comet.',
    genes: {
      speed: 0.95,
      size: 0.15,
      vision: 0.7,
      hue: 0.06,
      diet: 0.3,
      efficiency: 0.35,
      reproThreshold: 0.5,
      mutationRate: 0.3,
      lifespan: 0.4,
      nocturnal: 0.2,
    },
  },
  {
    name: 'Tank',
    description: 'Huge, slow, nearly unkillable. Outlasts famines.',
    genes: {
      speed: 0.15,
      size: 0.95,
      vision: 0.4,
      hue: 0.32,
      diet: 0.2,
      efficiency: 0.85,
      reproThreshold: 0.7,
      mutationRate: 0.15,
      lifespan: 0.95,
      nocturnal: 0.3,
    },
  },
  {
    name: 'Balanced',
    description: 'Jack of all trades — evolution decides the rest.',
    genes: {
      speed: 0.5,
      size: 0.5,
      vision: 0.5,
      hue: 0.55,
      diet: 0.35,
      efficiency: 0.5,
      reproThreshold: 0.55,
      mutationRate: 0.35,
      lifespan: 0.55,
      nocturnal: 0.4,
    },
  },
  {
    name: 'Nocturnal Hunter',
    description: 'Sees in the dark, hunts flesh while the world sleeps.',
    genes: {
      speed: 0.7,
      size: 0.6,
      vision: 0.85,
      hue: 0.78,
      diet: 0.92,
      efficiency: 0.55,
      reproThreshold: 0.6,
      mutationRate: 0.25,
      lifespan: 0.6,
      nocturnal: 0.95,
    },
  },
];
