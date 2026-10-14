/**
 * Colour palettes. Every scene colours itself through the prelude's
 * `palette(x)` = a + b*cos(2*PI*(c*x + d)); this module is the one place the
 * coefficients come from. `chord` follows the harmony (the chord's hue on the
 * circle of fifths); the rest are fixed looks.
 */
import { VisualsError } from './errors.js';

export type Vec3 = readonly [number, number, number];

export interface PaletteCoefficients {
  a: Vec3;
  b: Vec3;
  c: Vec3;
  d: Vec3;
}

export interface PaletteInfo {
  id: string;
  label: string;
  description: string;
}

export const PALETTES = [
  { id: 'chord', label: 'Follow the chords', description: 'Colours shift with the harmony: related chords get related colours.' },
  { id: 'neon', label: '4k neon', description: 'The full rainbow of the original 4k intro.' },
  { id: 'synthwave', label: 'Synthwave', description: 'Hot pink against electric cyan.' },
  { id: 'sunset', label: 'Sunset', description: 'Orange fading into deep violet.' },
  { id: 'ice', label: 'Ice', description: 'Pale frost and cold blue.' },
  { id: 'acid', label: 'Acid', description: 'Toxic lime and mint green.' },
  { id: 'mono', label: 'Monochrome', description: 'White and grey only, no colour.' },
] as const satisfies readonly PaletteInfo[];

export type PaletteId = (typeof PALETTES)[number]['id'];

const hex = (h: string): Vec3 => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Two-colour cosine palette: x=0 gives c1, x=0.5 gives c2, period 1. */
function twoTone(c1: string, c2: string): PaletteCoefficients {
  const p = hex(c1);
  const q = hex(c2);
  return {
    a: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2],
    b: [(p[0] - q[0]) / 2, (p[1] - q[1]) / 2, (p[2] - q[2]) / 2],
    c: [1, 1, 1],
    d: [0, 0, 0],
  };
}

const FIXED: Record<Exclude<PaletteId, 'chord'>, PaletteCoefficients> = {
  neon: { a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1, 1, 1], d: [0, 0.33, 0.67] },
  synthwave: twoTone('#ff2a8a', '#19e3ff'),
  sunset: twoTone('#ff8a1e', '#5b0fb0'),
  ice: twoTone('#e6f8ff', '#1f4dff'),
  acid: twoTone('#c4ff1a', '#00d98e'),
  mono: twoTone('#ffffff', '#3a3a44'),
};

/** Wraps a hue (or any phase) into 0..1. */
export const wrap01 = (x: number) => x - Math.floor(x);

/** Coefficients for a palette; `hue` (0..1) is used only by `chord`. */
export function paletteCoefficients(id: PaletteId, hue: number): PaletteCoefficients {
  if (id === 'chord') {
    if (!Number.isFinite(hue)) throw new VisualsError('invalid-argument', `palette hue must be finite, got ${hue}`);
    const h = wrap01(hue);
    // a narrowed rainbow (40% of the wheel) starting at the chord's hue
    return { a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [0.4, 0.4, 0.4], d: [-h, 0.33 - h, 0.67 - h] };
  }
  const p = FIXED[id];
  if (!p) throw new VisualsError('invalid-argument', `unknown palette ${String(id)}`);
  return p;
}
