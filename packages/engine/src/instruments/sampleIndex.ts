/**
 * The sample index: how a host finds and slices the recordings it downloads.
 *
 * scripts/samples/build.mjs writes one mono audio file per sample set plus an
 * index.json describing each file's zones. A host fetches the file's bytes (the
 * engine never fetches), then `sampleSetFromFile` decodes them with the engine's
 * own FLAC decoder, so no browser's codec support matters, and
 * `sampleSetFromPcm` slices the PCM into the SampleSet the engine plays. Every
 * step validates loudly.
 */
import { ProcMuseError } from '../core/errors.js';
import { decodeFlac } from './flac.js';
import { validateSampleSet, type SampleSet } from './samples.js';

export interface SampleIndexZone {
  root: number;
  velocity?: number;
  /** first frame of the zone in the set's file */
  start: number;
  length: number;
  /** loop, relative to the zone's first frame */
  loopStart?: number;
  loopEnd?: number;
}

export interface SampleIndexEntry {
  /** file name, relative to the index */
  file: string;
  bytes: number;
  /** frames in the decoded file */
  frames: number;
  zones: SampleIndexZone[];
}

export interface SampleIndex {
  version: 1;
  sampleRate: number;
  source: { name: string; url: string; license: string };
  sets: Record<string, SampleIndexEntry>;
}

function bad(msg: string): never {
  throw new ProcMuseError('invalid-samples', `sample index: ${msg}`);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

export function parseSampleIndex(json: unknown): SampleIndex {
  if (!isObj(json) || json.version !== 1) bad('not a version 1 index');
  if (!(typeof json.sampleRate === 'number' && json.sampleRate >= 8000)) bad(`sampleRate ${String(json.sampleRate)}`);
  const src = json.source;
  if (!isObj(src) || typeof src.name !== 'string' || typeof src.license !== 'string') bad('missing source and license');
  if (!isObj(json.sets) || !Object.keys(json.sets).length) bad('no sets');
  for (const [id, e] of Object.entries(json.sets)) {
    if (!isObj(e) || typeof e.file !== 'string' || !/^[\w.-]+$/.test(e.file)) bad(`${id}: bad file name`);
    if (!isCount(e.bytes) || !isCount(e.frames)) bad(`${id}: bad size`);
    if (!Array.isArray(e.zones) || !e.zones.length) bad(`${id}: no zones`);
    for (const z of e.zones as unknown[]) {
      if (!isObj(z) || !isCount(z.root) || !isCount(z.start) || !isCount(z.length)) bad(`${id}: bad zone`);
      if ((z.start as number) + (z.length as number) > (e.frames as number)) bad(`${id}: zone past the end of the file`);
    }
  }
  return json as unknown as SampleIndex;
}

/** Slices a decoded file into its SampleSet. The PCM must be exactly what the index describes. */
export function sampleSetFromPcm(index: SampleIndex, id: string, pcm: Float32Array): SampleSet {
  const e = index.sets[id];
  if (!e) throw new ProcMuseError('invalid-samples', `sample index has no set ${id}`);
  if (pcm.length !== e.frames) {
    throw new ProcMuseError('invalid-samples', `${id}: decoded ${pcm.length} frames, the index says ${e.frames}`);
  }
  return validateSampleSet({
    id,
    sampleRate: index.sampleRate,
    zones: e.zones.map((z) => ({
      root: z.root,
      velocity: z.velocity,
      data: pcm.subarray(z.start, z.start + z.length),
      loopStart: z.loopStart,
      loopEnd: z.loopEnd,
    })),
  });
}

/** Decodes one set's file (as listed in the index) and slices it: the one way file bytes become a SampleSet. */
export function sampleSetFromFile(index: SampleIndex, id: string, bytes: ArrayBuffer | Uint8Array): SampleSet {
  let audio;
  try {
    audio = decodeFlac(bytes);
  } catch (err) {
    throw new ProcMuseError('invalid-samples', `the recording ${id} could not be decoded (${(err as Error).message})`);
  }
  if (audio.sampleRate !== index.sampleRate) {
    throw new ProcMuseError('invalid-samples', `${id} is recorded at ${audio.sampleRate} Hz, the index says ${index.sampleRate}`);
  }
  if (audio.channels.length !== 1) throw new ProcMuseError('invalid-samples', `${id} has ${audio.channels.length} channels, recordings are mono`);
  return sampleSetFromPcm(index, id, audio.channels[0]!);
}
