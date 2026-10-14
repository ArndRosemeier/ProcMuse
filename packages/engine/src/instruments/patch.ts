/**
 * Patch: the data description of an instrument.
 *
 * There is ONE voice architecture (instruments/voice.ts). Every instrument,
 * drums included, is a Patch rendered by that voice: a kick is a sine with a
 * pitch envelope, a hat is filtered noise, a pad is detuned saws through a
 * slow filter. Adding an instrument means adding data, never a new synth class
 * (pinned by test/pins.test.ts).
 */
import type { AdsrSpec } from '../dsp/envelope.js';
import type { FilterMode } from '../dsp/filter.js';
import type { Waveform } from '../dsp/osc.js';
import { ProcMuseError } from '../core/errors.js';

export const PATCH_CATEGORIES = [
  'kick',
  'snare',
  'hat',
  'perc',
  'bass',
  'keys',
  'pad',
  'lead',
  'pluck',
  'bell',
  'strings',
  'brass',
  'texture',
] as const;
export type PatchCategory = (typeof PATCH_CATEGORIES)[number];

interface OscBase {
  level: number;
  octave?: number;
  semi?: number;
  /** cents */
  detune?: number;
}

export interface WaveOsc extends OscBase {
  type: 'wave';
  wave: Waveform;
  /** pulse width for square, 0.05..0.95 */
  pw?: number;
  /** number of detuned copies (1..7) */
  unison?: number;
  /** total unison detune spread in cents */
  spread?: number;
}

export interface FmOsc extends OscBase {
  type: 'fm';
  ratio: number;
  /** sustained modulation index (radians) */
  index: number;
  /** extra index at note start that decays away (the "bell strike") */
  indexEnv?: number;
  /** seconds for the extra index to decay */
  indexDecay?: number;
  feedback?: number;
}

export interface NoiseOsc {
  type: 'noise';
  level: number;
  pink?: boolean;
}

export interface PluckOsc extends OscBase {
  type: 'pluck';
  /** approximate T60 in seconds */
  decay: number;
  /** 0..1 */
  brightness: number;
}

export type OscSpec = WaveOsc | FmOsc | NoiseOsc | PluckOsc;

export interface FilterSpec {
  mode: FilterMode;
  cutoff: number;
  /** 0..1 */
  resonance: number;
  /** 0..1: how much the cutoff follows the played pitch */
  keyTrack?: number;
  /** octaves of cutoff sweep at full envelope */
  envAmount?: number;
  env?: AdsrSpec;
  /** octaves of extra cutoff at full velocity */
  velocity?: number;
}

export interface LfoSpec {
  /** Hz */
  rate: number;
  wave?: 'sine' | 'triangle';
  /** seconds before the LFO fades in */
  delay?: number;
  /** semitones */
  pitch?: number;
  /** octaves */
  cutoff?: number;
  /** 0..1 tremolo depth */
  amp?: number;
}

export interface Patch {
  id: string;
  name: string;
  category: PatchCategory;
  description: string;
  /** max simultaneous voices; 1 = monophonic */
  poly: number;
  /** portamento time in seconds (monophonic patches) */
  glide?: number;
  /** always sound this MIDI note, whatever is played (drums) */
  fixedNote?: number;
  oscillators: OscSpec[];
  amp: AdsrSpec;
  filter?: FilterSpec;
  pitchEnv?: { semitones: number; decay: number };
  lfo?: LfoSpec;
  /** 0..1 saturation */
  drive?: number;
  /** linear output gain */
  level: number;
  /** 0..1: how strongly velocity scales loudness */
  velocity?: number;
}

function bad(patch: { id?: unknown }, msg: string): never {
  throw new ProcMuseError('invalid-patch', `patch ${String(patch.id)}: ${msg}`);
}

function finite(patch: Patch, name: string, v: unknown, lo: number, hi: number): void {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) bad(patch, `${name}=${String(v)} not in [${lo}, ${hi}]`);
}

function adsr(patch: Patch, name: string, e: AdsrSpec): void {
  finite(patch, `${name}.attack`, e.attack, 0, 20);
  finite(patch, `${name}.decay`, e.decay, 0, 30);
  finite(patch, `${name}.sustain`, e.sustain, 0, 1);
  finite(patch, `${name}.release`, e.release, 0, 30);
}

/** Validates a patch at the boundary (registry load, or a patch supplied by an app). Throws loudly. */
export function validatePatch(patch: Patch): Patch {
  if (!patch || typeof patch.id !== 'string' || !patch.id) bad(patch ?? {}, 'missing id');
  if (!PATCH_CATEGORIES.includes(patch.category)) bad(patch, `unknown category ${String(patch.category)}`);
  finite(patch, 'poly', patch.poly, 1, 16);
  finite(patch, 'level', patch.level, 0, 4);
  if (!Array.isArray(patch.oscillators) || patch.oscillators.length < 1 || patch.oscillators.length > 4) {
    bad(patch, 'needs 1..4 oscillators');
  }
  for (const [i, o] of patch.oscillators.entries()) {
    finite(patch, `osc${i}.level`, o.level, 0, 4);
    if (o.type === 'wave') {
      if (!['sine', 'saw', 'square', 'triangle'].includes(o.wave)) bad(patch, `osc${i}.wave invalid`);
      if (o.unison !== undefined) finite(patch, `osc${i}.unison`, o.unison, 1, 7);
      if (o.pw !== undefined) finite(patch, `osc${i}.pw`, o.pw, 0.05, 0.95);
    } else if (o.type === 'fm') {
      finite(patch, `osc${i}.ratio`, o.ratio, 0.01, 32);
      finite(patch, `osc${i}.index`, o.index, 0, 40);
    } else if (o.type === 'pluck') {
      finite(patch, `osc${i}.decay`, o.decay, 0.01, 30);
      finite(patch, `osc${i}.brightness`, o.brightness, 0, 1);
    } else if (o.type !== 'noise') {
      bad(patch, `osc${i}.type invalid`);
    }
  }
  adsr(patch, 'amp', patch.amp);
  if (patch.filter) {
    finite(patch, 'filter.cutoff', patch.filter.cutoff, 10, 22000);
    finite(patch, 'filter.resonance', patch.filter.resonance, 0, 1);
    if (patch.filter.env) adsr(patch, 'filter.env', patch.filter.env);
  }
  if (patch.drive !== undefined) finite(patch, 'drive', patch.drive, 0, 1);
  return patch;
}
