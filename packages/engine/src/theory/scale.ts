/** Scales (modes) and diatonic degree arithmetic. */
import { pitchClass } from './pitch.js';

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  pentatonicMajor: [0, 2, 4, 7, 9],
  pentatonicMinor: [0, 3, 5, 7, 10],
} as const satisfies Record<string, readonly number[]>;

export type ScaleName = keyof typeof SCALES;
export const SCALE_NAMES = Object.keys(SCALES) as ScaleName[];

export const SCALE_LABELS: Record<ScaleName, string> = {
  major: 'Major',
  minor: 'Minor',
  dorian: 'Dorian',
  phrygian: 'Phrygian',
  lydian: 'Lydian',
  mixolydian: 'Mixolydian',
  harmonicMinor: 'Harmonic minor',
  pentatonicMajor: 'Pentatonic major',
  pentatonicMinor: 'Pentatonic minor',
};

/** A key: tonic pitch class plus a scale. Degrees are 0-based and may be negative or exceed the octave. */
export class Scale {
  readonly root: number;
  readonly name: ScaleName;
  readonly intervals: readonly number[];

  constructor(root: number, name: ScaleName) {
    this.root = pitchClass(root);
    this.name = name;
    this.intervals = SCALES[name];
  }

  get size(): number {
    return this.intervals.length;
  }

  /** MIDI note of a scale degree, with degree 0 = tonic in the octave starting at `baseMidi`'s C. */
  degree(degree: number, octave: number): number {
    const n = this.size;
    const oct = Math.floor(degree / n);
    const idx = degree - oct * n;
    return 12 * (octave + 1 + oct) + this.root + (this.intervals[idx] as number);
  }

  /** Is this MIDI note in the scale? */
  contains(midi: number): boolean {
    return this.intervals.includes((pitchClass(midi) - this.root + 12) % 12);
  }

  /** Nearest in-scale MIDI note (ties resolve downward). */
  quantize(midi: number): number {
    const m = Math.round(midi);
    for (let d = 0; d < 12; d++) {
      if (this.contains(m - d)) return m - d;
      if (this.contains(m + d)) return m + d;
    }
    return m;
  }

  /** Steps `steps` scale degrees from an in-scale note (negative = down). */
  step(midi: number, steps: number): number {
    let m = this.quantize(midi);
    const dir = Math.sign(steps);
    for (let i = 0; i < Math.abs(steps); i++) {
      do m += dir;
      while (!this.contains(m));
    }
    return m;
  }
}
