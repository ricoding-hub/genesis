/** Biome identifiers. Order matters: used as array indices. */
export enum Biome {
  Ocean = 0,
  Shore = 1,
  Grassland = 2,
  Forest = 3,
  Desert = 4,
  Tundra = 5,
  Mountain = 6,
  Wasteland = 7,
}

export const BIOME_NAMES: Record<Biome, string> = {
  [Biome.Ocean]: 'Ocean',
  [Biome.Shore]: 'Shore',
  [Biome.Grassland]: 'Grassland',
  [Biome.Forest]: 'Forest',
  [Biome.Desert]: 'Desert',
  [Biome.Tundra]: 'Tundra',
  [Biome.Mountain]: 'Mountain',
  [Biome.Wasteland]: 'Wasteland',
};

/** Per-biome simulation parameters. */
export interface BiomeParams {
  /** Food spawned per tile per second (average). */
  foodRate: number;
  /** Ambient temperature, 0 (frozen) .. 1 (scorching). */
  temperature: number;
  /** Movement cost multiplier. */
  moveCost: number;
  /** Whether land creatures can walk here. */
  walkable: boolean;
}

/**
 * Genome: every gene is stored normalized in [0, 1] and decoded into
 * phenotype ranges where used. Kept as a flat object for cheap cloning.
 */
export interface Genes {
  /** Max speed. */
  speed: number;
  /** Body size: affects energy storage, move cost, predation. */
  size: number;
  /** Vision radius for perception. */
  vision: number;
  /** Base hue of the body (0..1 → 0..360deg). */
  hue: number;
  /** Diet spectrum: 0 = pure herbivore, 1 = pure carnivore. */
  diet: number;
  /** Metabolic efficiency: reduces energy drain. */
  efficiency: number;
  /** Fraction of max energy required before reproducing. */
  reproThreshold: number;
  /** Probability/magnitude of mutation in offspring (a gene itself). */
  mutationRate: number;
  /** Maximum lifespan. */
  lifespan: number;
  /** 0 = strictly diurnal, 1 = strictly nocturnal. */
  nocturnal: number;
}

export const GENE_KEYS: (keyof Genes)[] = [
  'speed',
  'size',
  'vision',
  'hue',
  'diet',
  'efficiency',
  'reproThreshold',
  'mutationRate',
  'lifespan',
  'nocturnal',
];

export type LifeStage = 'infant' | 'juvenile' | 'adult' | 'elder';

export interface SpeciesInfo {
  id: number;
  /** Pixel-art body family, fixed at founding (see engine/Sprites.ts). */
  archetype: string;
  /** Centroid genome the species clusters around. */
  centroid: Genes;
  /** Display color derived from centroid hue. */
  color: string;
  /** Generation at which the species first appeared. */
  bornGeneration: number;
  /** World age (seconds) at speciation. */
  bornAt: number;
  /** Species it split from, -1 for genesis seed. */
  parentId: number;
  population: number;
  extinct: boolean;
}

export type GodTool =
  | 'none'
  | 'inspect'
  | 'terraform'
  | 'food'
  | 'kill'
  | 'spawn'
  | 'tribe';

/** Technological/cultural ages a humanoid tribe advances through. */
export enum Era {
  Stone = 0,
  Fire = 1,
  Tools = 2,
  Agriculture = 3,
  Faith = 4,
  Writing = 5,
}

export const ERA_NAMES: Record<Era, string> = {
  [Era.Stone]: 'Stone Age',
  [Era.Fire]: 'Age of Fire',
  [Era.Tools]: 'Age of Tools',
  [Era.Agriculture]: 'Agricultural Age',
  [Era.Faith]: 'Age of Faith',
  [Era.Writing]: 'Written Age',
};

export const ERA_ICONS: Record<Era, string> = {
  [Era.Stone]: '🪨',
  [Era.Fire]: '🔥',
  [Era.Tools]: '🪓',
  [Era.Agriculture]: '🌾',
  [Era.Faith]: '⛩️',
  [Era.Writing]: '📜',
};

export type StructureType = 'campfire' | 'shrine' | 'farm';

export interface Structure {
  id: number;
  type: StructureType;
  x: number;
  y: number;
  tribeId: number;
  /** Animation/age phase in seconds. */
  phase: number;
}

export interface CivMilestone {
  t: number;
  icon: string;
  text: string;
}

export interface TribeInfo {
  id: number;
  name: string;
  deity: string | null;
  color: string;
  era: Era;
  /** Progress 0..1 toward the next era. */
  eraProgress: number;
  knowledge: number;
  population: number;
  explorers: number;
  founded: number;
}

export type EventType = 'meteor' | 'iceage' | 'wildfire' | 'plague';

export interface ActiveEventInfo {
  type: EventType;
  /** 0..1 progress through the event. */
  progress: number;
  label: string;
}

/** Snapshot of one point of the population time series. */
export interface PopulationPoint {
  t: number;
  total: number;
  /** population keyed by `s{speciesId}` for recharts. */
  [key: string]: number;
}

export interface GeneHistogram {
  gene: keyof Genes;
  /** 10 buckets covering [0,1]. */
  buckets: number[];
}

export interface DominantSpecies {
  id: number;
  color: string;
  population: number;
  avgGenes: Genes;
}

export interface StatsSnapshot {
  population: number;
  foodCount: number;
  generation: number;
  /** World age in sim-seconds. */
  worldAge: number;
  /** 0..1, fraction of the current day elapsed. */
  dayPhase: number;
  isNight: boolean;
  births: number;
  deaths: number;
  fps: number;
  speed: number;
  paused: boolean;
  popSeries: PopulationPoint[];
  diversitySeries: { t: number; diversity: number }[];
  histograms: GeneHistogram[];
  species: SpeciesInfo[];
  dominant: DominantSpecies | null;
  activeEvents: ActiveEventInfo[];
  tribes: TribeInfo[];
  civLog: CivMilestone[];
}

/** Inspector data for one selected creature. */
export interface CreatureInfo {
  id: number;
  genes: Genes;
  energy: number;
  maxEnergy: number;
  age: number;
  lifespan: number;
  stage: LifeStage;
  generation: number;
  speciesId: number;
  speciesColor: string;
  archetype: string;
  children: number;
  /** Civilization data — present only for humanoids in a tribe. */
  tribeName: string | null;
  tribeEra: Era | null;
  deity: string | null;
  explorer: boolean;
}
