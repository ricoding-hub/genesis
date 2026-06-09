import { Biome } from '@/types';
import { clamp01, lerp } from './math';

/** [r, g, b] tuples 0..255. */
export type RGB = [number, number, number];

/** Base + accent color per biome (accent used for noise-driven variation). */
export const BIOME_COLORS: Record<Biome, { base: RGB; accent: RGB }> = {
  [Biome.Ocean]: { base: [16, 42, 84], accent: [24, 68, 124] },
  [Biome.Shore]: { base: [212, 192, 140], accent: [232, 214, 162] },
  [Biome.Grassland]: { base: [88, 142, 70], accent: [116, 168, 86] },
  [Biome.Forest]: { base: [42, 94, 56], accent: [30, 72, 44] },
  [Biome.Desert]: { base: [214, 178, 110], accent: [192, 152, 88] },
  [Biome.Tundra]: { base: [206, 218, 226], accent: [172, 192, 206] },
  [Biome.Mountain]: { base: [118, 112, 110], accent: [156, 150, 146] },
  [Biome.Wasteland]: { base: [72, 58, 52], accent: [94, 74, 62] },
};

export function rgbToCss(c: RGB, alpha = 1): string {
  return alpha >= 1
    ? `rgb(${c[0]},${c[1]},${c[2]})`
    : `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ];
}

export function hsl(h: number, s: number, l: number, a = 1): string {
  return a >= 1
    ? `hsl(${h.toFixed(0)},${(s * 100).toFixed(0)}%,${(l * 100).toFixed(0)}%)`
    : `hsla(${h.toFixed(0)},${(s * 100).toFixed(0)}%,${(l * 100).toFixed(0)}%,${a})`;
}

/**
 * Day/night ambient tint. Returns an rgba overlay color and its strength
 * for a given dayPhase in [0,1) where 0 = dawn, 0.25 = noon, 0.5 = dusk,
 * 0.75 = midnight.
 */
export function nightOverlay(dayPhase: number): { color: string; darkness: number } {
  // Light level: 1 at noon, 0 at midnight, smooth transitions at dawn/dusk.
  const angle = (dayPhase - 0.25) * Math.PI * 2;
  const light = clamp01(Math.cos(angle) * 0.65 + 0.55);
  const darkness = 1 - light;

  // Warm orange near dawn/dusk, deep blue at night.
  const duskiness = clamp01(1 - Math.abs(light - 0.45) / 0.25);
  const r = Math.round(lerp(8, 80, duskiness));
  const g = Math.round(lerp(10, 36, duskiness));
  const b = Math.round(lerp(36, 38, duskiness));
  return { color: `rgb(${r},${g},${b})`, darkness: darkness * 0.62 };
}
