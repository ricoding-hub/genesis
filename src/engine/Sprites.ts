import { Genes } from '@/types';

/**
 * Procedural pixel-art creature sprites. Each species is assigned a
 * recognizable archetype family at founding (wolf, bear, rabbit…) based on
 * its genes; the sprite is colorized from the species hue and cached.
 *
 * Template legend (strings, all rows equal length, creature faces RIGHT):
 *   '.' transparent   '#' outline   'B' body   'S' shade
 *   'W' belly/light   'E' eye       'A' accent (ears/beak/antlers/wings)
 */

export type ArchetypeId =
  | 'wolf'
  | 'bear'
  | 'deer'
  | 'rabbit'
  | 'bird'
  | 'owl'
  | 'lizard'
  | 'beetle'
  | 'humanoid';

export const ARCHETYPE_NAMES: Record<ArchetypeId, string> = {
  wolf: 'Wolf',
  bear: 'Bear',
  deer: 'Deer',
  rabbit: 'Rabbit',
  bird: 'Bird',
  owl: 'Owl',
  lizard: 'Lizard',
  beetle: 'Beetle',
  humanoid: 'Humanoid',
};

/** Two walk frames per archetype. */
const TEMPLATES: Record<ArchetypeId, [string[], string[]]> = {
  wolf: [
    [
      '..............A.',
      '.##..........AA.',
      '.#S#........#AA#',
      '..#S#......#BBB#',
      '...#S#....#BBBE#',
      '....#BBBBBBBBB##',
      '....#BBBBBBBBSS#',
      '....#BWWBBBWW#..',
      '....#B#...#B#...',
      '....#B#...#B#...',
      '.....#.....#....',
      '................',
    ],
    [
      '..............A.',
      '.##..........AA.',
      '.#S#........#AA#',
      '..#S#......#BBB#',
      '...#S#....#BBBE#',
      '....#BBBBBBBBB##',
      '....#BBBBBBBBSS#',
      '....#BWWBBBWW#..',
      '...#B#.....#B#..',
      '..#B#.......#B#.',
      '..#..........#..',
      '................',
    ],
  ],
  bear: [
    [
      '................',
      '....A......A....',
      '...#B######B#...',
      '...#BBBBBBBB#...',
      '..#BBBBBBBBBB#..',
      '..#BBBBBBBEBB#..',
      '..#SBBBBBBBBW#..',
      '..#SBBBBBBBWW#..',
      '..#SBBBBBBBBB#..',
      '..#BB#.....#BB#.',
      '..#BB#.....#BB#.',
      '...##.......##..',
    ],
    [
      '................',
      '....A......A....',
      '...#B######B#...',
      '...#BBBBBBBB#...',
      '..#BBBBBBBBBB#..',
      '..#BBBBBBBEBB#..',
      '..#SBBBBBBBBW#..',
      '..#SBBBBBBBWW#..',
      '..#SBBBBBBBBB#..',
      '.#BB#......#BB#.',
      '.#BB#.......#BB#',
      '..##.........##.',
    ],
  ],
  deer: [
    [
      '..........A..A..',
      '..........AAAA..',
      '...........#A#..',
      '..........#BBE#.',
      '.#........#BB##.',
      '.#S......#BBB#..',
      '..#SBBBBBBBBW#..',
      '...#BBBBBBBW#...',
      '...#B#...#B#....',
      '...#B#...#B#....',
      '...#B#...#B#....',
      '....#.....#.....',
    ],
    [
      '..........A..A..',
      '..........AAAA..',
      '...........#A#..',
      '..........#BBE#.',
      '.#........#BB##.',
      '.#S......#BBB#..',
      '..#SBBBBBBBBW#..',
      '...#BBBBBBBW#...',
      '..#B#.....#B#...',
      '..#B#......#B#..',
      '.#B#........#B#.',
      '..#..........#..',
    ],
  ],
  rabbit: [
    [
      '......A..A......',
      '.....#A##A#.....',
      '.....#A##A#.....',
      '......#BB#......',
      '.....#BBBE#.....',
      '....#BBBBB#.....',
      '..##BBBBBW#.....',
      '.#SSBBBBWW#.....',
      '.#SBBBBBBW#.....',
      '..#BBB#B#B#.....',
      '...#B#..#B#.....',
      '....#....#......',
    ],
    [
      '......A..A......',
      '.....#A##A#.....',
      '.....#A##A#.....',
      '......#BB#......',
      '.....#BBBE#.....',
      '....#BBBBB#.....',
      '..##BBBBBW#.....',
      '.#SSBBBBWW#.....',
      '.#SBBBBBBW#.....',
      '..#BB#BB#B#.....',
      '..#B#....#B#....',
      '...#......#.....',
    ],
  ],
  bird: [
    [
      '................',
      '.......###......',
      '......#BBB#.....',
      '......#BEB#AA...',
      '.....#BBBB#A....',
      '..#.#BBBBB#.....',
      '..#A#ABBBW#.....',
      '...#AABBWW#.....',
      '....#BBBW#......',
      '.....#BB#.......',
      '......##.#......',
      '.....#.#........',
    ],
    [
      '......###.......',
      '.....#BBB#......',
      '.....#BEB#AA....',
      '....#BBBB#A.....',
      '.#.#BBBBB#......',
      '.#A#ABBBW#......',
      '..#AABBWW#......',
      '...#BBBW#.......',
      '....#BB#........',
      '.....##.........',
      '....#.#.........',
      '................',
    ],
  ],
  owl: [
    [
      '....#......#....',
      '....##....##....',
      '...#BB####BB#...',
      '...#BBBBBBBB#...',
      '..#BWEBBBBEWB#..',
      '..#BWWBBBBWWB#..',
      '..#BBBBAABBBB#..',
      '..#SBWWWWWWBS#..',
      '..#SBWWWWWWBS#..',
      '...#BWWWWWWB#...',
      '....#B####B#....',
      '.....#....#.....',
    ],
    [
      '....#......#....',
      '....##....##....',
      '...#BB####BB#...',
      '...#BBBBBBBB#...',
      '..#BWEBBBBEWB#..',
      '..#BWWBBBBWWB#..',
      '..#BBBBAABBBB#..',
      '..#SBWWWWWWBS#..',
      '..#SBWWWWWWBS#..',
      '...#BWWWWWWB#...',
      '....##....##....',
      '................',
    ],
  ],
  lizard: [
    [
      '................',
      '................',
      '................',
      '............##..',
      '...........#BBE#',
      '#S.........#BB#.',
      '.#SS......#BBB#.',
      '..#SSBBBBBBBBA#.',
      '...#BBBBBBBBB#..',
      '...#B#A##A#B#...',
      '..#B#......#B#..',
      '................',
    ],
    [
      '................',
      '................',
      '................',
      '............##..',
      '...........#BBE#',
      '.#S.........#BB#',
      '#S.S......#BBB#.',
      '..#SSBBBBBBBBA#.',
      '...#BBBBBBBBB#..',
      '...#B#A##A#B#...',
      '...#B#....#B#...',
      '................',
    ],
  ],
  beetle: [
    [
      '................',
      '..........#..#..',
      '.....####.#..#..',
      '....#SSSS##BB#..',
      '...#SSSSSS#BE#..',
      '..#SBBBBBSS#B#..',
      '..#SBBBBBBS###..',
      '..#SBBBBBSS#....',
      '...#SSSSSS#.....',
      '..#.#####.#.....',
      '.#.#.....#.#....',
      '................',
    ],
    [
      '................',
      '..........#..#..',
      '.....####.#..#..',
      '....#SSSS##BB#..',
      '...#SSSSSS#BE#..',
      '..#SBBBBBSS#B#..',
      '..#SBBBBBBS###..',
      '..#SBBBBBSS#....',
      '...#SSSSSS#.....',
      '...#.###.#......',
      '..#.#...#.#.....',
      '................',
    ],
  ],
  humanoid: [
    [
      '.....####.......',
      '....#BBBB#......',
      '....#BEBE#......',
      '....#BBBB#......',
      '.....#BB#.......',
      '...##WWWW##.....',
      '..#B#WWWW#B#....',
      '..#B#WWWW#B#....',
      '...#.#WW#.#.....',
      '.....####.......',
      '....#B##B#......',
      '....##..##......',
    ],
    [
      '.....####.......',
      '....#BBBB#......',
      '....#BEBE#......',
      '....#BBBB#......',
      '.....#BB#.......',
      '...##WWWW##.....',
      '..#B#WWWW#B#....',
      '...##WWWW##.....',
      '.....#WW#.......',
      '....##.###......',
      '...#B#...#B#....',
      '...##.....##....',
    ],
  ],
};

/**
 * Pick the archetype a genome belongs to. Deterministic argmax over
 * gene-derived scores; offsets tuned so all families actually occur.
 */
export function pickArchetype(g: Genes): ArchetypeId {
  const scores: Record<ArchetypeId, number> = {
    humanoid: g.vision * 1.05 + g.efficiency * 1.05 - 0.92,
    wolf: g.diet * 1.35 + g.speed * 0.65 - 0.38,
    bear: g.diet * 0.65 + g.size * 1.25 - 0.42,
    owl: g.nocturnal * 1.25 + g.vision * 0.55 - 0.38,
    bird: g.speed * 0.95 + (1 - g.size) * 0.75 + g.vision * 0.25 - 0.62,
    rabbit: (1 - g.diet) * 0.65 + g.speed * 0.55 + (1 - g.size) * 0.55 - 0.5,
    deer: (1 - g.diet) * 0.75 + g.size * 0.65 + g.lifespan * 0.25 - 0.42,
    lizard: (1 - g.efficiency) * 0.55 + (1 - g.lifespan) * 0.45 - 0.12,
    beetle: (1 - g.size) * 0.85 + g.efficiency * 0.6 - 0.5,
  };
  let best: ArchetypeId = 'lizard';
  let bestScore = -Infinity;
  for (const key of Object.keys(scores) as ArchetypeId[]) {
    if (scores[key] > bestScore) {
      bestScore = scores[key];
      best = key;
    }
  }
  return best;
}

const HUE_BUCKETS = 24;
const spriteCache = new Map<string, HTMLCanvasElement>();

function paletteFor(hue: number): Record<string, string> {
  const h = Math.round(hue * 360);
  return {
    '#': `hsl(${h},40%,13%)`,
    B: `hsl(${h},62%,56%)`,
    S: `hsl(${h},58%,38%)`,
    W: `hsl(${h},42%,78%)`,
    E: '#0b0d13',
    A: `hsl(${(h + 45) % 360},72%,62%)`,
  };
}

export function spriteSize(arch: ArchetypeId): { w: number; h: number } {
  const rows = TEMPLATES[arch][0];
  return { w: rows[0].length, h: rows.length };
}

/** Get (and cache) the colorized sprite canvas for an archetype + hue. */
export function getSprite(arch: ArchetypeId, hue: number, frame: 0 | 1): HTMLCanvasElement {
  const bucket = Math.round(((hue % 1) + 1) % 1 * HUE_BUCKETS) % HUE_BUCKETS;
  const key = `${arch}|${bucket}|${frame}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;

  const rows = TEMPLATES[arch][frame];
  const w = rows[0].length;
  const h = rows.length;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const palette = paletteFor(bucket / HUE_BUCKETS);
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      ctx.fillStyle = palette[ch] ?? palette.B;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  spriteCache.set(key, canvas);
  return canvas;
}

export function spriteCacheSize(): number {
  return spriteCache.size;
}

/** Debug: render every archetype × frame on one sheet (for visual QA). */
export function debugSheet(scale = 8): HTMLCanvasElement {
  const archs = Object.keys(TEMPLATES) as ArchetypeId[];
  const cell = 18 * scale;
  const canvas = document.createElement('canvas');
  canvas.width = cell * archs.length;
  canvas.height = cell * 2 + 24;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1a2433';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  archs.forEach((arch, i) => {
    for (const frame of [0, 1] as const) {
      const sprite = getSprite(arch, (i / archs.length) * 0.9, frame);
      ctx.drawImage(
        sprite,
        i * cell + scale,
        frame * cell + scale,
        sprite.width * scale,
        sprite.height * scale,
      );
    }
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.fillText(arch, i * cell + 4, canvas.height - 8);
  });
  return canvas;
}
