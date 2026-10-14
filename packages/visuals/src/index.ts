/**
 * @procmuse/visuals — music-reactive WebGL2 scenes driven by the engine's MusicState.
 *
 * Usage:
 *   const visuals = new Visuals(canvas);           // throws VisualsError without WebGL2
 *   ui.bind(visuals.params);                       // same ParamSpec model as the engine
 *   requestAnimationFrame(function loop(ms) {
 *     visuals.frame(tracker.update(audioTime), ms / 1000);
 *     requestAnimationFrame(loop);
 *   });
 *
 * The pure pieces (mapping, flash limiter, director, quality controller,
 * shader assembly) are exported so other renderers and tests can reuse them.
 */
export { Visuals, type VisualsOptions } from './visuals.js';
export { VisualsError, type VisualsErrorReason } from './errors.js';
export {
  V,
  buildVisualParamSpecs,
  readSettings,
  QUALITY_LEVELS,
  type QualityId,
  type SceneChoice,
  type VisualSettings,
  type VisualSpecOptions,
} from './params.js';
export { SCENE_INFO, SCENE_IDS, type SceneId, type SceneInfo } from './scenes/registry.js';
export { PALETTES, paletteCoefficients, type PaletteId, type PaletteCoefficients } from './palettes.js';
export { mapUniforms, initialMotion, type MotionState, type MappingResult } from './mapping.js';
export { stepFlash, initialFlashState, FLASH_DEFAULTS, type FlashConfig, type FlashState, type FlashStep } from './flash.js';
export { resolveScene, stepDirector, initialDirector, type DirectorState } from './director.js';
export { stepAutoQuality, initialAutoQuality, resolutionScale, QUALITY_SCALE, type AutoQualityState } from './quality.js';
export type { FrameUniforms, UniformName } from './uniforms.js';
