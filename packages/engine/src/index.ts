/**
 * @procmuse/engine — headless procedural music.
 *
 * The public surface: EngineCore (sample-pulling engine), renderOffline,
 * parameter specs, the MusicState tracker for visuals, and the data registries
 * (styles, patches, instrument collections) so apps can list and describe them.
 * Recorded instruments arrive as decoded SampleSets from the host.
 */
export { EngineCore, type EngineCommand, type EngineCoreOptions } from './engine/core.js';
export type {
  EngineEvent,
  NoteEventMsg,
  BeatEventMsg,
  SectionEventMsg,
  ChordEventMsg,
  LevelsEventMsg,
  ParamEventMsg,
} from './engine/events.js';
export { JOURNEY_BARS, P, SEED_LIMIT, buildParamSpecs, seedFrom, styleDefaults, type JourneyPace } from './engine/paramSpecs.js';
export {
  ParamStore,
  validateParamValue,
  type ParamSpec,
  type NumberParamSpec,
  type EnumParamSpec,
  type BoolParamSpec,
  type EnumOption,
  type ParamValue,
  type ParamValues,
  type ParamSource,
  type ParamListener,
} from './core/params.js';
export { ProcMuseError, type ProcMuseErrorCode } from './core/errors.js';
export { Rng, hash32 } from './core/rng.js';
export { Emitter } from './core/emitter.js';
export { MusicStateTracker, type MusicState } from './state/tracker.js';
export { renderOffline, type OfflineOptions, type OfflineResult } from './render/offline.js';
export { encodeWav } from './render/wav.js';
export { PART_IDS, PART_INFO, partRecord, type PartId, type PartInfo } from './compose/parts.js';
export { STYLES, DEFAULT_STYLE_ID, getStyle } from './compose/styles.js';
export type { Style } from './compose/style.js';
export { SECTION_KINDS, type SectionKind } from './compose/types.js';
export { BUILTIN_PATCHES, RECORDED_PATCHES, getPatch } from './instruments/registry.js';
export type { Patch, PatchCategory } from './instruments/patch.js';
export { validateSampleSet, type SampleSet, type SampleZone } from './instruments/samples.js';
export {
  parseSampleIndex,
  sampleSetFromPcm,
  type SampleIndex,
  type SampleIndexEntry,
  type SampleIndexZone,
} from './instruments/sampleIndex.js';
export {
  COLLECTIONS,
  NO_COLLECTION,
  getCollection,
  collectionSampleSets,
  requireCollectionSamples,
  castBand,
  type CastingInputs,
  type Collection,
} from './compose/collection.js';
export { clamp, clamp01, lerp, dbToGain, gainToDb } from './core/math.js';
