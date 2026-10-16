/** Building blocks shared by the built-in styles, so each style file states only what makes it different. */
import type { ProgressionTable } from '../../theory/progression.js';
import type { PartId } from '../parts.js';
import type { PartStyle, Style } from '../style.js';

export const MINOR_POP: ProgressionTable = {
  0: { 5: 3, 3: 3, 6: 2, 4: 1.5 },
  1: { 4: 2, 6: 1 },
  2: { 5: 2, 3: 1 },
  3: { 6: 2, 0: 2, 4: 3 },
  4: { 0: 4, 5: 1.5 },
  5: { 3: 3, 6: 2, 0: 1, 4: 1 },
  6: { 0: 3, 5: 2, 3: 1 },
};

export const MAJOR_POP: ProgressionTable = {
  0: { 4: 3, 5: 3, 3: 3, 1: 1 },
  1: { 4: 3, 3: 1 },
  2: { 5: 2, 3: 1 },
  3: { 0: 3, 4: 3, 1: 1 },
  4: { 5: 3, 0: 3, 3: 1 },
  5: { 3: 3, 1: 1, 4: 2 },
  6: { 0: 3 },
};

/** Slow-moving, tonic-heavy harmony for hypnotic and ambient styles. */
export const MODAL: ProgressionTable = {
  0: { 0: 1, 6: 2, 5: 2, 3: 1.5, 1: 0.5 },
  1: { 0: 2, 6: 1 },
  3: { 0: 2, 5: 1 },
  5: { 0: 2, 6: 1, 3: 1 },
  6: { 0: 3, 5: 1 },
};

/** ii–V–I flavoured movement for jazzy styles. */
export const JAZZY: ProgressionTable = {
  0: { 5: 2, 1: 3, 3: 2, 2: 1 },
  1: { 4: 4, 6: 0.5 },
  2: { 5: 2, 1: 1 },
  3: { 2: 1, 4: 2, 1: 1 },
  4: { 0: 4, 3: 1, 5: 0.5 },
  5: { 1: 3, 3: 1 },
  6: { 2: 2, 0: 1 },
};

export const DEFAULT_FORM: Style['form'] = {
  start: 'intro',
  transitions: {
    intro: { build: 3, groove: 2 },
    build: { drop: 5, groove: 1 },
    drop: { groove: 2, break: 3, drop: 1, outro: 0.2 },
    groove: { build: 2, break: 2, drop: 1, outro: 0.2 },
    break: { build: 4, groove: 1 },
    outro: { intro: 1 },
  },
  lengths: {
    intro: { '8': 2, '16': 1 },
    build: { '8': 3, '4': 1 },
    drop: { '16': 3, '32': 1 },
    groove: { '16': 2, '8': 1 },
    break: { '8': 2, '16': 1 },
    outro: { '8': 1 },
  },
};

/** No builds or drops: a steady groove with breaks, for laid-back styles (lo-fi, jazz, bossa). */
export const GROOVE_FORM: Style['form'] = {
  ...DEFAULT_FORM,
  transitions: {
    ...DEFAULT_FORM.transitions,
    intro: { groove: 3 },
    groove: { break: 2, groove: 1, drop: 1 },
    drop: { groove: 2, break: 1 },
    break: { groove: 3 },
  },
};

/** Long, slow sections that drift between groove and break, for ambient and sacred styles. */
export const DRIFT_FORM: Style['form'] = {
  start: 'intro',
  transitions: {
    intro: { groove: 2, break: 1 },
    build: { groove: 2 },
    drop: { groove: 1, break: 1 },
    groove: { break: 2, groove: 1, build: 0.5 },
    break: { groove: 2, intro: 0.5 },
    outro: { intro: 1 },
  },
  lengths: {
    intro: { '16': 1 },
    build: { '8': 1 },
    drop: { '16': 1 },
    groove: { '16': 2, '32': 1 },
    break: { '16': 1 },
    outro: { '16': 1 },
  },
};

const z = 0;
/** Grids are written as four beats of four 16ths. */
export const G = {
  four: [1, z, z, z, 1, z, z, z, 1, z, z, z, 1, z, z, z],
  backbeat: [z, z, z, z, 1, z, z, z, z, z, z, z, 1, z, z, z],
  offbeat8: [z, z, 1, z, z, z, 1, z, z, z, 1, z, z, z, 1, z],
  eighths: [1, z, 1, z, 1, z, 1, z, 1, z, 1, z, 1, z, 1, z],
  silent: [z, z, z, z, z, z, z, z, z, z, z, z, z, z, z, z],
} as const;

/** Elementwise max of grids, with each grid scaled: mix([g, 1], [h, 0.4]). */
export function mix(...layers: [readonly number[], number][]): number[] {
  const out = new Array<number>(16).fill(0);
  for (const [g, s] of layers) for (let i = 0; i < 16; i++) out[i] = Math.max(out[i] as number, (g[i] as number) * s);
  return out;
}

const DEFAULT_PARTS: Record<PartId, PartStyle> = {
  kick: { instrument: 'kick-4k', minEnergy: 0.35, level: 0, pan: 0, reverb: 0.02, delay: 0 },
  snare: { instrument: 'snare-classic', minEnergy: 0.45, level: -3, pan: 0, reverb: 0.15, delay: 0 },
  hats: { instrument: 'hat-closed', minEnergy: 0.3, level: -6, pan: 0.25, reverb: 0.05, delay: 0 },
  perc: { instrument: 'perc-wood', minEnergy: 0.6, level: -8, pan: -0.3, reverb: 0.15, delay: 0.15 },
  bass: { instrument: 'bass-4k', minEnergy: 0.3, level: -3, pan: 0, reverb: 0, delay: 0 },
  chords: { instrument: 'pluck-synth', minEnergy: 0.45, level: -6, pan: -0.15, reverb: 0.3, delay: 0.15 },
  pad: { instrument: 'pad-4k', minEnergy: 0, level: -8, pan: 0, reverb: 0.5, delay: 0 },
  arp: { instrument: 'arp-4k', minEnergy: 0.5, level: -8, pan: 0.2, reverb: 0.25, delay: 0.4 },
  lead: { instrument: 'lead-fm-bell', minEnergy: 0.6, level: -4, pan: 0.05, reverb: 0.3, delay: 0.3 },
  texture: { instrument: 'texture-riser', minEnergy: 0, level: -10, pan: 0, reverb: 0.4, delay: 0 },
};

/** Default part table with per-style overrides merged in. */
export function parts(overrides: Partial<Record<PartId, Partial<PartStyle>>>): Record<PartId, PartStyle> {
  const out = {} as Record<PartId, PartStyle>;
  for (const key of Object.keys(DEFAULT_PARTS) as PartId[]) out[key] = { ...DEFAULT_PARTS[key], ...overrides[key] };
  return out;
}
