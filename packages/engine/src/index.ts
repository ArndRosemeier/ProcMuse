/**
 * @procmuse/engine — headless procedural music.
 *
 * The public surface: EngineCore (sample-pulling engine), renderOffline,
 * parameter specs, the MusicState tracker for visuals, and the data registries
 * (styles, patches) so apps can list and describe them.
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
export { P, SEED_LIMIT, buildParamSpecs, seedFrom, styleDefaults } from './engine/paramSpecs.js';
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
export { BUILTIN_PATCHES, getPatch } from './instruments/registry.js';
export type { Patch, PatchCategory } from './instruments/patch.js';
export { clamp, clamp01, lerp, dbToGain, gainToDb } from './core/math.js';
