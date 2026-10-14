/** Data types shared by the composer and its part generators. */
import type { Chord, ChordType } from '../theory/chord.js';
import type { Scale } from '../theory/scale.js';
import type { Rng } from '../core/rng.js';
import type { PartId } from './parts.js';
import type { Style } from './style.js';

export interface NoteEvent {
  part: PartId;
  /** MIDI note */
  pitch: number;
  /** 0..1 */
  velocity: number;
  /** absolute position in beats */
  start: number;
  /** length in beats */
  duration: number;
}

export const SECTION_KINDS = ['intro', 'build', 'drop', 'groove', 'break', 'outro'] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

/** The listener-facing macro controls, read once per bar. All 0..1. */
export interface Macros {
  energy: number;
  complexity: number;
  variation: number;
  swing: number;
  humanize: number;
}

/** A melodic idea: onsets (in 16th steps over two bars) and scale-step contour. */
export interface Motif {
  steps: number[];
  lengths: number[];
  contour: number[];
}

export interface Theme {
  id: number;
  progression: Chord[];
  /** bars per chord */
  chordBars: number;
  motif: Motif;
}

export interface Section {
  index: number;
  kind: SectionKind;
  startBar: number;
  bars: number;
  /** 0..1 */
  energy: number;
  active: Record<PartId, boolean>;
  theme: Theme;
  /** per-section pattern choices, drawn once so a section grooves consistently */
  choices: SectionChoices;
}

export interface SectionChoices {
  bass: string;
  chords: string;
  arp: string;
  arpRate: 2 | 4;
  drumSeed: number;
}

/** Everything a part generator needs to write one bar. */
export interface BarContext {
  bar: number;
  /** absolute beat where the bar starts */
  startBeat: number;
  barInSection: number;
  section: Section;
  nextSection: SectionKind | null;
  chord: Chord;
  nextChord: Chord;
  chordIndex: number;
  scale: Scale;
  style: Style;
  macros: Macros;
  rng: Rng;
}

export type PartMemory = { voicing: number[] | null; lastPitch: number | null };

export type ChordTypeWeights = Partial<Record<ChordType, number>>;
