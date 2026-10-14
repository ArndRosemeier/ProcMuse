/**
 * THE uniform table. The GLSL prelude's uniform declarations are generated
 * from it, and the renderer uploads values by walking it, so the TypeScript
 * side and the shaders cannot drift apart.
 */
export const UNIFORM_TYPES = {
  // per pass (set by the renderer)
  uResolution: 'vec2',
  uFade: 'float',
  uSceneA: 'sampler2D',
  uSceneB: 'sampler2D',
  // per frame (computed by mapUniforms)
  uTime: 'float',
  uTravel: 'float',
  uMotion: 'float',
  uBeat: 'float',
  uBar: 'float',
  uKick: 'float',
  uSnare: 'float',
  uHats: 'float',
  uBass: 'float',
  uChords: 'float',
  uPad: 'float',
  uArp: 'float',
  uLead: 'float',
  uEnergy: 'float',
  uIntensity: 'float',
  uProgress: 'float',
  uMelody: 'float',
  uSeed: 'float',
  uWarp: 'float',
  uPulse: 'float',
  uShake: 'vec2',
  uGain: 'float',
  uDetail: 'float',
  uSteps: 'int',
  uPalA: 'vec3',
  uPalB: 'vec3',
  uPalC: 'vec3',
  uPalD: 'vec3',
  uGrain: 'float',
  uFlash: 'float',
} as const;

export type UniformName = keyof typeof UNIFORM_TYPES;
export type UniformType = (typeof UNIFORM_TYPES)[UniformName];

type TsOf<T extends UniformType> = T extends 'vec2'
  ? readonly [number, number]
  : T extends 'vec3'
    ? readonly [number, number, number]
    : number;

/** Uniforms the renderer sets per pass; everything else comes from mapUniforms. */
export const PASS_UNIFORMS = ['uResolution', 'uFade', 'uSceneA', 'uSceneB'] as const;
export type PassUniformName = (typeof PASS_UNIFORMS)[number];

/** The per-frame uniform values (pure output of mapUniforms). */
export type FrameUniforms = { [K in Exclude<UniformName, PassUniformName>]: TsOf<(typeof UNIFORM_TYPES)[K]> };

/** The GLSL `uniform` lines for the prelude. */
export function uniformDeclarations(): string {
  return Object.entries(UNIFORM_TYPES)
    .map(([name, type]) => `uniform ${type} ${name};`)
    .join('\n');
}
