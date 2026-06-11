/**
 * Time realism layer. The engine keeps running on sim-seconds (ecology is
 * tuned in those units); this module converts to human-readable years.
 */

/** Sim-seconds per displayed world year (1 s ≈ 4 months). */
export const YEAR_SECONDS = 3;

/** World age in whole years. */
export function worldYears(worldAgeSeconds: number): number {
  return Math.floor(worldAgeSeconds / YEAR_SECONDS) + 1;
}

/**
 * Realistic life expectancy ranges (years) per archetype. Display-only:
 * a creature's age is mapped from its sim lifespan fraction onto this
 * range, so a rabbit dies of old age around 8 and a human around 80.
 */
const EXPECTANCY: Record<string, [number, number]> = {
  humanoid: [55, 85],
  bear: [18, 30],
  wolf: [8, 14],
  deer: [10, 18],
  rabbit: [4, 9],
  bird: [5, 12],
  owl: [8, 15],
  lizard: [5, 12],
  beetle: [1, 3],
};

export function expectancyYears(archetype: string, lifespanGene: number): number {
  const [min, max] = EXPECTANCY[archetype] ?? [5, 15];
  return Math.round(min + lifespanGene * (max - min));
}

/** Displayed age in years for a creature (fraction of lifespan × expectancy). */
export function ageYears(
  archetype: string,
  lifespanGene: number,
  age: number,
  lifespan: number,
): number {
  const frac = Math.min(1, age / lifespan);
  return Math.floor(frac * expectancyYears(archetype, lifespanGene));
}
