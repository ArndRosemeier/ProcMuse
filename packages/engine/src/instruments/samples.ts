/**
 * Recorded instruments: sample sets and the bank that holds them.
 *
 * The engine never fetches audio (it is headless). A host fetches the files,
 * turns them into SampleSets with `sampleSetFromFile` (the engine's own
 * decoder) and hands them over; `validateSampleSet` is the boundary, and a
 * missing set is a loud error, never silence.
 */
import { ProcMuseError } from '../core/errors.js';

export interface SampleZone {
  /** MIDI note the recording sounds at when played at its own speed */
  root: number;
  /** 0..1: the lowest velocity this zone answers (velocity layers); absent = 0 */
  velocity?: number;
  /** mono PCM at the set's sample rate */
  data: Float32Array;
  /** sustain loop in frames, loopStart < loopEnd <= data.length; absent = one-shot */
  loopStart?: number;
  loopEnd?: number;
}

export interface SampleSet {
  id: string;
  sampleRate: number;
  zones: SampleZone[];
}

function bad(id: unknown, msg: string): never {
  throw new ProcMuseError('invalid-samples', `sample set ${String(id)}: ${msg}`);
}

/** Validates a set at the boundary (a host handing over decoded audio). Throws loudly. */
export function validateSampleSet(set: SampleSet): SampleSet {
  if (!set || typeof set.id !== 'string' || !set.id) bad(set?.id, 'missing id');
  if (!(Number.isFinite(set.sampleRate) && set.sampleRate >= 8000 && set.sampleRate <= 192000)) bad(set.id, `sampleRate ${set.sampleRate}`);
  if (!Array.isArray(set.zones) || set.zones.length === 0) bad(set.id, 'no zones');
  for (const [i, z] of set.zones.entries()) {
    if (!(Number.isInteger(z.root) && z.root >= 0 && z.root <= 127)) bad(set.id, `zone ${i} root ${z.root}`);
    if (!(z.data instanceof Float32Array) || z.data.length < 16) bad(set.id, `zone ${i} has no audio`);
    if (z.velocity !== undefined && !(z.velocity >= 0 && z.velocity <= 1)) bad(set.id, `zone ${i} velocity ${z.velocity}`);
    const looped = z.loopStart !== undefined || z.loopEnd !== undefined;
    if (looped) {
      const s = z.loopStart as number;
      const e = z.loopEnd as number;
      if (!(Number.isInteger(s) && Number.isInteger(e) && s >= 0 && e - s >= 16 && e <= z.data.length)) {
        bad(set.id, `zone ${i} loop ${s}..${e} outside 0..${z.data.length}`);
      }
    }
  }
  return set;
}

/**
 * Picks the zone for a note: among the zones whose velocity floor the note
 * reaches (the loudest such layer), the one whose root is nearest.
 */
export function pickZone(set: SampleSet, note: number, velocity: number): SampleZone {
  let floor = 0;
  for (const z of set.zones) {
    const v = z.velocity ?? 0;
    if (v <= velocity && v > floor) floor = v;
  }
  let best: SampleZone | null = null;
  for (const z of set.zones) {
    if ((z.velocity ?? 0) !== floor) continue;
    if (!best || Math.abs(z.root - note) < Math.abs(best.root - note)) best = z;
  }
  return best as SampleZone;
}

/** The sample sets one engine has been given. */
export class SampleBank {
  private readonly sets = new Map<string, SampleSet>();

  add(set: SampleSet): void {
    validateSampleSet(set);
    this.sets.set(set.id, set);
  }

  has(id: string): boolean {
    return this.sets.has(id);
  }

  get(id: string): SampleSet {
    const s = this.sets.get(id);
    if (!s) throw new ProcMuseError('missing-samples', `the recordings for ${id} are not loaded`);
    return s;
  }
}
