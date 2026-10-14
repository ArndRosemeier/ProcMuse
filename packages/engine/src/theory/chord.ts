/** Diatonic chords built by stacking scale steps, plus voice leading. */
import type { Scale } from './scale.js';
import { pitchClass } from './pitch.js';

export const CHORD_TYPES = ['triad', 'seventh', 'sus2', 'sus4', 'add9', 'ninth', 'power'] as const;
export type ChordType = (typeof CHORD_TYPES)[number];

/** Scale-degree offsets (from the chord root degree) that make up each chord type. */
const DEGREE_STACKS: Record<ChordType, readonly number[]> = {
  triad: [0, 2, 4],
  seventh: [0, 2, 4, 6],
  sus2: [0, 1, 4],
  sus4: [0, 3, 4],
  add9: [0, 2, 4, 8],
  ninth: [0, 2, 4, 6, 8],
  power: [0, 4, 7],
};

export interface Chord {
  /** Scale degree of the chord root (0 = tonic). */
  degree: number;
  type: ChordType;
  /** Root as a MIDI note in octave 2 (bass register). */
  root: number;
  /** Pitch classes of all chord tones, root first. */
  pitchClasses: number[];
}

export function buildChord(scale: Scale, degree: number, type: ChordType): Chord {
  // Pentatonic scales are too sparse to stack thirds; build on the parent heptatonic idea
  // by stacking every other scale step, which still yields consonant chords.
  const stack = DEGREE_STACKS[type];
  const notes = stack.map((d) => scale.degree(degree + d, 2));
  return {
    degree,
    type,
    root: notes[0] as number,
    pitchClasses: notes.map(pitchClass),
  };
}

/** All MIDI notes of the chord's pitch classes inside [low, high]. */
export function chordTonesInRange(chord: Chord, low: number, high: number): number[] {
  const out: number[] = [];
  for (let m = Math.ceil(low); m <= high; m++) if (chord.pitchClasses.includes(pitchClass(m))) out.push(m);
  return out;
}

/**
 * Voices `chord` with `voices` notes inside [low, high], choosing the voicing that
 * moves least from `previous` (smooth voice leading). With no previous voicing,
 * the result is a close voicing centered in the range.
 */
export function voiceLead(chord: Chord, previous: readonly number[] | null, voices: number, low: number, high: number): number[] {
  const tones = chordTonesInRange(chord, low, high);
  if (tones.length === 0) return [];
  const center = previous && previous.length ? previous.reduce((a, b) => a + b, 0) / previous.length : (low + high) / 2;
  let best: number[] = [];
  let bestCost = Infinity;
  // Candidate voicings: consecutive windows of chord tones (close and spread positions).
  for (let spread = 1; spread <= 2; spread++) {
    for (let start = 0; start < tones.length; start++) {
      const v: number[] = [];
      for (let i = 0; i < voices; i++) {
        const t = tones[start + i * spread];
        if (t === undefined) break;
        v.push(t);
      }
      if (v.length < voices) continue;
      let cost: number;
      if (previous && previous.length) {
        cost = 0;
        for (let i = 0; i < v.length; i++) cost += Math.abs((v[i] as number) - (previous[Math.min(i, previous.length - 1)] as number));
      } else {
        cost = Math.abs(v.reduce((a, b) => a + b, 0) / v.length - center);
      }
      // gently prefer covering the root pitch class
      if (!v.some((n) => pitchClass(n) === chord.pitchClasses[0])) cost += 3;
      if (cost < bestCost) {
        bestCost = cost;
        best = v;
      }
    }
  }
  return best.length ? best : tones.slice(0, voices);
}
