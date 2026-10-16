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
  /**
   * Seconds for this oscillator alone to fade by 60 dB from the note start.
   * Lets one patch hold partials that die at different rates (a bell's high
   * partials go first, an organ's chiff is gone in a blink). Absent = no fade.
   */
  fade?: number;
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
  /** as OscBase.fade: a breath, chiff or strike that dies away on its own */
  fade?: number;
}

export interface PluckOsc extends OscBase {
  type: 'pluck';
  /** approximate T60 in seconds */
  decay: number;
  /** 0..1 */
  brightness: number;
}

/** A recorded instrument: plays the nearest zone of a SampleSet (instruments/samples.ts), repitched. */
export interface SampleOsc extends OscBase {
  type: 'sample';
  /** id of the SampleSet the host loads */
  set: string;
}

export type OscSpec = WaveOsc | FmOsc | NoiseOsc | PluckOsc | SampleOsc;

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

/**
 * Fixed resonant peaks after the main filter: the body of an instrument (a
 * horn's bell, a chanter's nasal bore, a vowel). Unlike the main filter they
 * do not follow the played pitch, which is what makes them sound like a body.
 */
export interface FormantSpec {
  peaks: { freq: number; gain: number }[];
  /** 0..1: sharpness of every peak */
  resonance: number;
  /** 0..: how much of the unfiltered signal passes beside the peaks */
  dry?: number;
}

export const MAX_OSCILLATORS = 6;
export const MAX_FORMANT_PEAKS = 4;

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
  /** playable MIDI range [low, high], at least an octave: notes outside are moved by octaves into it */
  range?: [number, number];
  oscillators: OscSpec[];
  amp: AdsrSpec;
  filter?: FilterSpec;
  formant?: FormantSpec;
  /** pitch offset at note start that decays to 0: positive drops (drums), negative scoops up (horns) */
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

/** The sample sets a patch plays (none for a synthesized patch). */
export function patchSampleSets(patch: Patch): string[] {
  return patch.oscillators.flatMap((o) => (o.type === 'sample' ? [o.set] : []));
}

/** Validates a patch at the boundary (registry load, or a patch supplied by an app). Throws loudly. */
export function validatePatch(patch: Patch): Patch {
  if (!patch || typeof patch.id !== 'string' || !patch.id) bad(patch ?? {}, 'missing id');
  if (!PATCH_CATEGORIES.includes(patch.category)) bad(patch, `unknown category ${String(patch.category)}`);
  finite(patch, 'poly', patch.poly, 1, 16);
  finite(patch, 'level', patch.level, 0, 4);
  if (!Array.isArray(patch.oscillators) || patch.oscillators.length < 1 || patch.oscillators.length > MAX_OSCILLATORS) {
    bad(patch, `needs 1..${MAX_OSCILLATORS} oscillators`);
  }
  for (const [i, o] of patch.oscillators.entries()) {
    finite(patch, `osc${i}.level`, o.level, 0, 4);
    if (o.fade !== undefined) finite(patch, `osc${i}.fade`, o.fade, 0.001, 60);
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
    } else if (o.type === 'sample') {
      if (typeof o.set !== 'string' || !o.set) bad(patch, `osc${i}.set missing`);
    } else if (o.type !== 'noise') {
      bad(patch, `osc${i}.type invalid`);
    }
  }
  if (patch.range) {
    const [lo, hi] = patch.range;
    finite(patch, 'range.low', lo, 0, 127);
    finite(patch, 'range.high', hi, 0, 127);
    if (hi - lo < 12) bad(patch, `range ${lo}..${hi} is narrower than an octave`);
  }
  adsr(patch, 'amp', patch.amp);
  if (patch.filter) {
    finite(patch, 'filter.cutoff', patch.filter.cutoff, 10, 22000);
    finite(patch, 'filter.resonance', patch.filter.resonance, 0, 1);
    if (patch.filter.env) adsr(patch, 'filter.env', patch.filter.env);
  }
  if (patch.formant) {
    const fm = patch.formant;
    if (!Array.isArray(fm.peaks) || fm.peaks.length < 1 || fm.peaks.length > MAX_FORMANT_PEAKS) {
      bad(patch, `formant needs 1..${MAX_FORMANT_PEAKS} peaks`);
    }
    for (const [i, pk] of fm.peaks.entries()) {
      finite(patch, `formant.peak${i}.freq`, pk.freq, 20, 16000);
      finite(patch, `formant.peak${i}.gain`, pk.gain, 0, 4);
    }
    finite(patch, 'formant.resonance', fm.resonance, 0, 0.98);
    if (fm.dry !== undefined) finite(patch, 'formant.dry', fm.dry, 0, 2);
  }
  if (patch.pitchEnv) {
    finite(patch, 'pitchEnv.semitones', patch.pitchEnv.semitones, -48, 48);
    finite(patch, 'pitchEnv.decay', patch.pitchEnv.decay, 0, 10);
  }
  if (patch.drive !== undefined) finite(patch, 'drive', patch.drive, 0, 1);
  return patch;
}
