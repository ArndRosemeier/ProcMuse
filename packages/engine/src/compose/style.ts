/**
 * Style: the data that makes techno sound like techno. Part generators are
 * written once (compose/generators/*) and parameterized by a Style; adding a
 * genre means adding data, never new generator code.
 */
import { ProcMuseError } from '../core/errors.js';
import { getPatch } from '../instruments/registry.js';
import type { ChordType } from '../theory/chord.js';
import type { ProgressionTable } from '../theory/progression.js';
import { SCALE_NAMES, type ScaleName } from '../theory/scale.js';
import { PART_IDS, PART_INFO, type PartId } from './parts.js';
import { SECTION_KINDS, type SectionKind } from './types.js';

/** 16 step probabilities (one bar of 16ths), 0..1. */
export type Grid = readonly number[];

export const BASS_PATTERNS = ['pulse8', 'offbeat', 'root4', 'sync', 'walk', 'long', 'arp', 'gallop', 'octave', 'riddim'] as const;
export type BassPattern = (typeof BASS_PATTERNS)[number];
export const CHORD_PATTERNS = ['sustain', 'stabs', 'pulse', 'offbeat', 'strum', 'skank', 'comp'] as const;
export type ChordPattern = (typeof CHORD_PATTERNS)[number];
export const ARP_PATTERNS = ['up', 'down', 'updown', 'random', 'pinky', 'converge'] as const;
export type ArpPattern = (typeof ARP_PATTERNS)[number];

export type Weights<K extends string> = Partial<Record<K, number>>;

export interface PartStyle {
  /** default patch id */
  instrument: string;
  /** the part plays only in sections at or above this energy (0..1) */
  minEnergy: number;
  /** default mix */
  level: number;
  pan: number;
  reverb: number;
  delay: number;
}

export interface Style {
  id: string;
  name: string;
  description: string;
  tempo: { default: number; min: number; max: number };
  /** 0..1 default swing */
  swing: number;
  scales: Weights<ScaleName>;
  progression: ProgressionTable;
  progressionLength: Weights<'2' | '4' | '8'>;
  chordBars: Weights<'1' | '2'>;
  chordTypes: Weights<ChordType>;
  form: {
    start: SectionKind;
    transitions: Record<SectionKind, Weights<SectionKind>>;
    lengths: Record<SectionKind, Weights<'4' | '8' | '16' | '32'>>;
  };
  drums: { kick: Grid; snare: Grid; hats: Grid; perc: Grid };
  bass: { patterns: Weights<BassPattern>; octave: number };
  chords: { patterns: Weights<ChordPattern>; voices: [number, number]; low: number; high: number };
  arp: { patterns: Weights<ArpPattern>; rate16: number; octaves: number };
  lead: { density: number; low: number; high: number };
  parts: Record<PartId, PartStyle>;
  fx: { reverbSize: number; delayBeats: number; duck: number };
}

function bad(style: { id?: unknown }, msg: string): never {
  throw new ProcMuseError('invalid-style', `style ${String(style.id)}: ${msg}`);
}

function positive(style: Style, name: string, w: Record<string, number | undefined>, allowed?: readonly string[]): void {
  const keys = Object.keys(w);
  if (!keys.some((k) => (w[k] ?? 0) > 0)) bad(style, `${name} has no positive weight`);
  if (allowed) for (const k of keys) if (!allowed.includes(k)) bad(style, `${name}: unknown key ${k}`);
}

function grid(style: Style, name: string, g: Grid): void {
  if (g.length !== 16 || g.some((p) => !(p >= 0 && p <= 1))) bad(style, `${name} must be 16 probabilities`);
}

/** Validates a style, including that every default instrument exists and fits its part. */
export function validateStyle(style: Style): Style {
  if (!style || typeof style.id !== 'string') bad(style ?? {}, 'missing id');
  const t = style.tempo;
  if (!(t.min >= 40 && t.max <= 220 && t.min <= t.default && t.default <= t.max)) bad(style, 'tempo range invalid');
  positive(style, 'scales', style.scales, SCALE_NAMES);
  positive(style, 'progressionLength', style.progressionLength);
  positive(style, 'chordBars', style.chordBars);
  positive(style, 'chordTypes', style.chordTypes);
  if (!style.progression[0]) bad(style, 'progression needs a row for degree 0');
  for (const k of SECTION_KINDS) {
    positive(style, `form.transitions.${k}`, style.form.transitions[k], SECTION_KINDS);
    positive(style, `form.lengths.${k}`, style.form.lengths[k]);
  }
  grid(style, 'drums.kick', style.drums.kick);
  grid(style, 'drums.snare', style.drums.snare);
  grid(style, 'drums.hats', style.drums.hats);
  grid(style, 'drums.perc', style.drums.perc);
  positive(style, 'bass.patterns', style.bass.patterns, BASS_PATTERNS);
  positive(style, 'chords.patterns', style.chords.patterns, CHORD_PATTERNS);
  positive(style, 'arp.patterns', style.arp.patterns, ARP_PATTERNS);
  for (const p of PART_IDS) {
    const ps = style.parts[p];
    if (!ps) bad(style, `missing part ${p}`);
    const patch = getPatch(ps.instrument);
    if (!PART_INFO[p].categories.includes(patch.category)) {
      bad(style, `part ${p} default ${ps.instrument} is a ${patch.category}, not one of ${PART_INFO[p].categories.join('/')}`);
    }
  }
  return style;
}
